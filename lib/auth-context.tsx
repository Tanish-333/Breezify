"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  updatePassword,
  deleteUser,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  auth,
  db,
  googleProvider,
  githubProvider,
  appleProvider,
  isFirebaseConfigured,
} from "@/lib/firebase";
import type { FeatherUser } from "@/lib/types";

const SIGNUP_BONUS_CREDITS = 5.0;

interface AuthContextValue {
  user: User | null;
  profile: FeatherUser | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithGithub: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changePassword: (newPassword: string) => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function ensureUserDoc(user: User) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  const providers = user.providerData.map((p) => p.providerId);

  if (!snap.exists()) {
    await setDoc(ref, {
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      credits: SIGNUP_BONUS_CREDITS,
      plan: "free",
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp(),
      authProviders: providers,
    });
  } else {
    await updateDoc(ref, {
      lastLoginAt: serverTimestamp(),
      authProviders: providers,
      displayName: user.displayName ?? snap.data().displayName ?? null,
      photoURL: user.photoURL ?? snap.data().photoURL ?? null,
    });
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

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        await ensureUserDoc(u);
        await loadProfile(u);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  async function refreshProfile() {
    if (auth.currentUser) await loadProfile(auth.currentUser);
  }

  function assertConfigured() {
    if (!isFirebaseConfigured) {
      throw new Error(
        "Firebase isn't configured yet. Add your Firebase project keys to .env.local."
      );
    }
  }

  async function signUpWithEmail(email: string, password: string, displayName?: string) {
    assertConfigured();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) {
      const { updateProfile } = await import("firebase/auth");
      await updateProfile(cred.user, { displayName });
    }
    await ensureUserDoc(cred.user);
    await sendEmailVerification(cred.user);
    await loadProfile(cred.user);
  }

  async function signInWithEmail(email: string, password: string) {
    assertConfigured();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDoc(cred.user);
    await loadProfile(cred.user);
  }

  async function oauthSignIn(provider: typeof googleProvider) {
    assertConfigured();
    const cred = await signInWithPopup(auth, provider);
    await ensureUserDoc(cred.user);
    await loadProfile(cred.user);
  }

  async function resetPassword(email: string) {
    await sendPasswordResetEmail(auth, email);
  }

  async function changePassword(newPassword: string) {
    if (!auth.currentUser) throw new Error("Not signed in");
    await updatePassword(auth.currentUser, newPassword);
  }

  async function deleteAccount() {
    if (!auth.currentUser) throw new Error("Not signed in");
    await deleteUser(auth.currentUser);
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
    signInWithApple: () => oauthSignIn(appleProvider),
    resetPassword,
    changePassword,
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
