"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GithubAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import {
  auth,
  db,
  googleProvider,
  githubProvider,
  githubRepoProvider,
} from "@/lib/firebase";
import { setGithubToken } from "@/lib/github-connect";
import type { FeatherUser } from "@/lib/types";

/**
 * True for password accounts that haven't clicked their verification link
 * yet. OAuth accounts (Google, GitHub) are excluded: Firebase only sets
 * emailVerified from what the provider itself already confirmed, so there's
 * no verification step of ours for them to complete.
 */
export function isUnverifiedEmailUser(user: User): boolean {
  return user.providerData.some((p) => p.providerId === "password") && !user.emailVerified;
}

interface AuthContextValue {
  user: User | null;
  profile: FeatherUser | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<User>;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  connectGithub: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  reauthenticateWithPassword: (currentPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Ensures users/{uid} exists, granting the signup bonus the first time.
 * Delegates to /api/claim-signup (Admin SDK) rather than writing directly
 * from the client: that's the only path that can enforce a per-IP monthly
 * cap on how many bonus signups happen from one address, since a Firestore
 * security rule has no way to see the caller's IP (see that route and
 * firestore.rules' users/{userId} create rule for the full reasoning).
 */
async function ensureUserDoc(user: User) {
  const token = await user.getIdToken();
  const providers = user.providerData.map((p) => p.providerId);
  const res = await fetch("/api/claim-signup", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      displayName: user.displayName,
      photoURL: user.photoURL,
      authProviders: providers,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Couldn't set up your account.");
  }
}

function toProfile(uid: string, data: any): FeatherUser {
  return {
    uid,
    email: data.email ?? null,
    displayName: data.displayName ?? null,
    photoURL: data.photoURL ?? null,
    credits: typeof data.credits === "number" ? data.credits : 0,
    plan: data.plan ?? "free",
    createdAt: data.createdAt?.toMillis?.() ?? Date.now(),
    lastLoginAt: data.lastLoginAt?.toMillis?.() ?? Date.now(),
    authProviders: data.authProviders ?? [],
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<FeatherUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(u: User) {
    const ref = doc(db, "users", u.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) setProfile(toProfile(u.uid, snap.data()));
  }

  // Guards against out-of-order resolution: e.g. a sign-in fires, its
  // ensureUserDoc/loadProfile calls are still in flight, and the user signs
  // out before they resolve. Without this, the stale sign-in callback's
  // state updates can land after the sign-out's and leave the UI showing a
  // signed-in user while auth.currentUser is actually null.
  const authEventId = useRef(0);

  useEffect(() => {
    // Firebase resolves this almost instantly from local persistence, but if the
    // network hangs (flaky connection, blocked request) we still need to stop
    // showing a spinner and fall back to the signed-out UI rather than hang forever.
    const failSafe = setTimeout(() => setLoading(false), 4000);
    let unsubProfile: (() => void) | undefined;

    const unsub = onAuthStateChanged(
      auth,
      async (u) => {
        const id = ++authEventId.current;
        setUser(u);
        unsubProfile?.();
        unsubProfile = undefined;
        if (u) {
          try {
            await ensureUserDoc(u);
          } catch {
            // Profile sync failed (offline, permissions); still let the user in.
          }
          // A superseded event (e.g. signed out again while ensureUserDoc was
          // still in flight) must not open a profile listener after the
          // fact — it would keep firing indefinitely with a signed-out
          // uid's data, since nothing else would ever unsubscribe it.
          if (authEventId.current !== id) return;
          // A live listener rather than a one-time fetch, so a plan upgrade
          // (Stripe webhook writes it via the admin SDK, not this client)
          // or a credit deduction from another tab shows up immediately
          // instead of only after the next manual refreshProfile() call.
          unsubProfile = onSnapshot(doc(db, "users", u.uid), (snap) => {
            if (snap.exists()) setProfile(toProfile(u.uid, snap.data()));
          });
        } else {
          setProfile(null);
        }
        if (authEventId.current !== id) return;
        clearTimeout(failSafe);
        setLoading(false);
      },
      () => {
        clearTimeout(failSafe);
        setLoading(false);
      }
    );
    return () => {
      clearTimeout(failSafe);
      unsub();
      unsubProfile?.();
    };
  }, []);

  async function refreshProfile() {
    if (auth.currentUser) await loadProfile(auth.currentUser);
  }

  async function signUpWithEmail(email: string, password: string, displayName?: string): Promise<User> {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName) {
        const { updateProfile } = await import("firebase/auth");
        await updateProfile(cred.user, { displayName });
      }
      await ensureUserDoc(cred.user);
      await sendEmailVerification(cred.user);
      await loadProfile(cred.user);
      return cred.user;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== "auth/email-already-in-use") throw err;

      // Firebase can't tell us whether that existing account was ever
      // verified without a password, so try signing into it with what was
      // just submitted. If it works and it's still unverified, this is the
      // same person picking up an abandoned signup, so resend the link and
      // resume onboarding instead of dead-ending on "account already
      // exists". A wrong password (or an already-verified account) falls
      // through to the normal error.
      let cred;
      try {
        cred = await signInWithEmailAndPassword(auth, email, password);
      } catch {
        throw err;
      }
      if (cred.user.emailVerified) {
        await firebaseSignOut(auth);
        throw err;
      }
      await ensureUserDoc(cred.user);
      await sendEmailVerification(cred.user);
      await loadProfile(cred.user);
      return cred.user;
    }
  }

  async function signInWithEmail(email: string, password: string): Promise<User> {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDoc(cred.user);
    await loadProfile(cred.user);
    return cred.user;
  }

  async function oauthSignIn(provider: typeof googleProvider) {
    const cred = await signInWithPopup(auth, provider);
    await ensureUserDoc(cred.user);
    await loadProfile(cred.user);
  }

  /**
   * Authorizes GitHub with repo access and stores the resulting OAuth token
   * (see lib/github-connect.ts) so pushing a generated app never needs a
   * manually pasted personal access token. Linking works when the account's
   * primary sign-in isn't already GitHub; when it is, GitHub is re-consented
   * via reauthentication instead, since you can't link a provider to itself.
   */
  async function connectGithub(): Promise<void> {
    if (!auth.currentUser) throw new Error("You must be signed in.");
    let result;
    try {
      result = await linkWithPopup(auth.currentUser, githubRepoProvider);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/credential-already-in-use" || code === "auth/provider-already-linked") {
        result = await reauthenticateWithPopup(auth.currentUser, githubRepoProvider);
      } else {
        throw err;
      }
    }
    const credential = GithubAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("GitHub didn't return an access token. Please try again.");
    }
    setGithubToken(credential.accessToken);
    // linkWithPopup/reauthenticateWithPopup update auth.currentUser's own
    // providerData immediately, but nothing else re-syncs that into the
    // Firestore profile the Settings page's "Connected providers" card
    // actually reads — normally that only happens on the next full
    // sign-in, via ensureUserDoc. Mirror it here too so it shows up right
    // away; the live profile listener picks up the write automatically.
    const providers = auth.currentUser.providerData.map((p) => p.providerId);
    await updateDoc(doc(db, "users", auth.currentUser.uid), { authProviders: providers }).catch(
      () => {}
    );
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function changePassword(newPassword: string) {
    if (!auth.currentUser) throw new Error("Not signed in");
    await updatePassword(auth.currentUser, newPassword);
  }

  /**
   * Firebase requires a "recent" sign-in for sensitive changes like a
   * password update; changePassword throws auth/requires-recent-login once
   * the session's gotten old enough. This re-proves identity with the
   * account's current password so the caller can retry immediately instead
   * of forcing a full sign-out/sign-in round trip.
   */
  async function reauthenticateWithPassword(currentPassword: string) {
    if (!auth.currentUser?.email) throw new Error("Not signed in");
    const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, credential);
  }

  async function deleteAccount() {
    if (!auth.currentUser) throw new Error("Not signed in");
    const token = await auth.currentUser.getIdToken();
    const res = await fetch("/api/delete-account", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to delete account.");
    }
    await firebaseSignOut(auth);
  }

  async function signOut() {
    await firebaseSignOut(auth);
  }

  const value: AuthContextValue = {
    user,
    profile,
    loading,
    signUpWithEmail,
    signInWithEmail,
    signInWithGoogle: () => oauthSignIn(googleProvider),
    signInWithGithub: () => oauthSignIn(githubProvider),
    connectGithub,
    resetPassword,
    changePassword,
    reauthenticateWithPassword,
    deleteAccount,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
