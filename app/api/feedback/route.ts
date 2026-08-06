import { NextRequest, NextResponse } from "next/server";
import { commit, createWrite } from "@/lib/firestore-rest";
import { verifyIdToken } from "@/lib/verify-id-token";
import { sendFeedbackNotificationEmail } from "@/lib/email";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

// Not disclosed anywhere in the UI (no "X of 5 used today" counter) —
// only surfaced as an error on the submission that actually goes over it.
const FEEDBACK_DAILY_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many feedback docs this uid has submitted in the last 24h.
 * feedback/{id} has `allow read: if false` in firestore.rules (deliberately
 * private, admin-only — see the route's own comment below), so this can
 * only be checked via the Admin SDK, not the caller's own idToken. Queried
 * by uid alone (a single-field equality filter needs no composite index)
 * and filtered to the last 24h in memory, same pattern as
 * lib/use-transactions.ts's useTransactions — feedback volume per person is
 * inherently small, so this never scans much.
 */
async function recentFeedbackCount(uid: string): Promise<number> {
  const cutoff = Date.now() - DAY_MS;
  const snap = await adminDb().collection("feedback").where("uid", "==", uid).get();
  let count = 0;
  for (const doc of snap.docs) {
    const createdAt = doc.get("createdAt");
    const ms = createdAt && typeof createdAt.toMillis === "function" ? createdAt.toMillis() : 0;
    if (ms >= cutoff) count++;
  }
  return count;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!idToken) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  let uid: string;
  try {
    uid = (await verifyIdToken(idToken)).uid;
  } catch {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be JSON" },
      { status: 400 }
    );
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400 }
    );
  }

  const { subject, message, type } = body as Record<string, unknown>;

  if (
    !subject ||
    !message ||
    typeof subject !== "string" ||
    typeof message !== "string"
  ) {
    return NextResponse.json(
      {
        error: "Required fields: subject (string), message (string), type (optional string)",
      },
      { status: 400 }
    );
  }

  if (isFirebaseAdminConfigured()) {
    try {
      const recent = await recentFeedbackCount(uid);
      if (recent >= FEEDBACK_DAILY_LIMIT) {
        return NextResponse.json(
          { error: `You've sent more than ${FEEDBACK_DAILY_LIMIT} messages today. Please try again tomorrow.` },
          { status: 429 }
        );
      }
    } catch (err) {
      // Best-effort: a failure to check the limit must never block a
      // legitimate submission from someone well under it.
      console.error(`[feedback] uid=${uid} failed to check the daily limit:`, err);
    }
  }

  const feedbackId = randomUUID();
  const feedbackData = {
    uid,
    subject,
    message,
    type: type || "general",
    status: "unread",
    createdAt: new Date(),
  };

  try {
    await commit([createWrite(`feedback/${feedbackId}`, feedbackData)], idToken);
    // Best-effort, and genuinely non-blocking: feedback/{id} is unreadable
    // via the client SDK by design (see firestore.rules), so this is the
    // only way to ever see what was submitted short of the Firebase console
    // — but it must never hold up the response the submitter is waiting on.
    // This used to `await` the send directly, so a slow or hung outbound
    // call to Resend (no timeout on that fetch) left the client's "Send
    // feedback" button spinning indefinitely even though the feedback had
    // already been saved. A capped race means the worst case is a few
    // seconds' delay, never a hang, and the feedback is never lost either
    // way since it's already committed above.
    await Promise.race([
      sendFeedbackNotificationEmail({
        uid,
        type: typeof type === "string" ? type : "general",
        subject,
        message,
      }),
      new Promise((resolve) => setTimeout(resolve, 4000)),
    ]).catch((err) => {
      console.error(`[feedback] id=${feedbackId} failed to send notification email:`, err);
    });
    return NextResponse.json(
      { id: feedbackId, message: "Feedback submitted successfully" },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to submit feedback" },
      { status: 500 }
    );
  }
}
