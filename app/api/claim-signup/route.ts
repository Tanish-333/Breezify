import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { adminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";

const SIGNUP_BONUS_CREDITS = 5.0;

// Shared IPs (offices, schools, NAT'd households) are common, so this isn't
// tuned to catch every alt account — it's tuned to make farming many
// accounts from one IP in a single month costly rather than unlimited.
const MAX_SIGNUPS_PER_IP_PER_MONTH = 3;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Ensures users/{uid} exists, creating it (with the signup bonus) the first
 * time. This runs server-side with the Admin SDK — not the client SDK a
 * previous version of this used — for two reasons:
 *
 * 1. Abuse prevention: firestore.rules can't see the caller's IP, so an
 *    IP-based limit on how many bonus signups happen per month can only be
 *    enforced here, not in a security rule. A client-side create is now
 *    capped at 0 credits (see firestore.rules) specifically so this is the
 *    only path that can ever grant the real bonus.
 * 2. Self-healing: if users/{uid} is ever missing while signups/{uid}
 *    (the one-time bonus marker) already exists — e.g. a partial failure
 *    left the profile doc gone without going through full account deletion
 *    — the old client-side flow would silently fail forever ("User account
 *    not found" on every request) since the security rule requires
 *    !exists(signups/{uid}) to create with the bonus. This always recreates
 *    the profile if missing, just without re-granting credits.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  let uid: string;
  let tokenEmail: string | undefined;
  try {
    const verified = await verifyIdToken(idToken);
    uid = verified.uid;
    tokenEmail = verified.email;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  let body: { displayName?: string; photoURL?: string; authProviders?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // Body is optional; profile fields just fall back to defaults below.
  }

  const db = adminDb();
  const userRef = db.collection("users").doc(uid);
  const signupRef = db.collection("signups").doc(uid);
  const ip = getClientIp(req);
  const monthKey = currentMonthKey();
  const ipRef = db.collection("signupIps").doc(`${ip}_${monthKey}`);

  try {
    const result = await db.runTransaction(async (tx) => {
      const [userSnap, signupSnap, ipSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(signupRef),
        tx.get(ipRef),
      ]);

      if (userSnap.exists) {
        tx.update(userRef, {
          lastLoginAt: FieldValue.serverTimestamp(),
          authProviders: body.authProviders ?? userSnap.data()?.authProviders ?? [],
          displayName: body.displayName ?? userSnap.data()?.displayName ?? null,
          photoURL: body.photoURL ?? userSnap.data()?.photoURL ?? null,
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
        email: tokenEmail ?? null,
        displayName: body.displayName ?? null,
        photoURL: body.photoURL ?? null,
        credits: grantBonus ? SIGNUP_BONUS_CREDITS : 0,
        plan: "free",
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
        authProviders: body.authProviders ?? [],
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

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[claim-signup] uid=${uid} failed:`, err);
    return NextResponse.json({ error: "Couldn't set up your account. Please try again." }, { status: 500 });
  }
}
