import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const SIGNUP_BONUS_CREDITS = 5.0;

// Shared IPs (offices, schools, NAT'd households) are common, so this isn't
// tuned to catch every alt account — it's tuned to make farming many
// accounts from one IP in a single month costly rather than unlimited.
const MAX_SIGNUPS_PER_IP_PER_MONTH = 3;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface ClaimSignupProfile {
  displayName?: string | null;
  photoURL?: string | null;
  authProviders?: string[];
}

/**
 * Ensures users/{uid} exists, granting the signup bonus the first time —
 * the Admin-SDK core shared by app/api/claim-signup (the client's own
 * sign-in path) and lib/ensure-user-doc-server.ts (the self-heal path a
 * handful of other routes fall back to if a profile is somehow still
 * missing when they need it). Runs with the Admin SDK, not a caller's own
 * idToken, specifically so the per-IP monthly cap below can be enforced —
 * firestore.rules has no way to see the caller's IP, so a client-side
 * users/{uid} create is capped at 0 credits (see firestore.rules) and this
 * Admin-SDK path is the only one that can ever grant the real bonus.
 */
export async function claimSignup(
  uid: string,
  ip: string,
  email: string | undefined,
  profile: ClaimSignupProfile = {}
): Promise<{ granted: boolean; alreadyExisted: boolean }> {
  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const signupRef = db.collection("signups").doc(uid);
  const monthKey = currentMonthKey();
  const ipRef = db.collection("signupIps").doc(`${ip}_${monthKey}`);

  return db.runTransaction(async (tx) => {
    const [userSnap, signupSnap, ipSnap] = await Promise.all([
      tx.get(userRef),
      tx.get(signupRef),
      tx.get(ipRef),
    ]);

    if (userSnap.exists) {
      tx.update(userRef, {
        lastLoginAt: FieldValue.serverTimestamp(),
        authProviders: profile.authProviders ?? userSnap.data()?.authProviders ?? [],
        displayName: profile.displayName ?? userSnap.data()?.displayName ?? null,
        photoURL: profile.photoURL ?? userSnap.data()?.photoURL ?? null,
      });
      return { granted: false, alreadyExisted: true };
    }

    // Never regrant the bonus once claimed, regardless of IP standing —
    // this is what stops delete-and-recreate farming even after the
    // 30-day account-deletion lock elapses.
    const alreadyClaimedBonus = signupSnap.exists;
    const ipCount = ipSnap.exists ? (ipSnap.data()?.count ?? 0) : 0;
    const ipLimitHit = ipCount >= MAX_SIGNUPS_PER_IP_PER_MONTH;
    const grantBonus = !alreadyClaimedBonus && !ipLimitHit;

    tx.set(userRef, {
      email: email ?? null,
      displayName: profile.displayName ?? null,
      photoURL: profile.photoURL ?? null,
      credits: grantBonus ? SIGNUP_BONUS_CREDITS : 0,
      plan: "free",
      createdAt: FieldValue.serverTimestamp(),
      lastLoginAt: FieldValue.serverTimestamp(),
      authProviders: profile.authProviders ?? [],
    });
    if (!alreadyClaimedBonus) {
      tx.set(signupRef, { claimedAt: FieldValue.serverTimestamp() });
    }
    tx.set(
      ipRef,
      { count: ipCount + 1, month: monthKey, lastSignupAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { granted: grantBonus, alreadyExisted: false };
  });
}

export function getClientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
