import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { claimSignup, getClientIp } from "@/lib/claim-signup";

export const runtime = "nodejs";

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

  try {
    const result = await claimSignup(uid, getClientIp(req.headers), tokenEmail, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error(`[claim-signup] uid=${uid} failed:`, err);
    return NextResponse.json({ error: "Couldn't set up your account. Please try again." }, { status: 500 });
  }
}
