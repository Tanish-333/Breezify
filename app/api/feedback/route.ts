import { NextRequest, NextResponse } from "next/server";
import { commit, createWrite } from "@/lib/firestore-rest";
import { verifyIdToken } from "@/lib/verify-id-token";
import { sendFeedbackNotificationEmail } from "@/lib/email";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

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
