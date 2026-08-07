import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { commit, createWrite } from "@/lib/firestore-rest";
import { rateLimit } from "@/lib/rate-limit";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 8000;
// context is arbitrary caller-supplied JSON; cap its serialized size rather
// than trying to validate its shape, so it can't be used to write an
// unbounded document.
const MAX_CONTEXT_JSON_LENGTH = 4000;

async function handler(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, stack, context, level } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing message field" },
        { status: 400 }
      );
    }

    let safeContext: unknown = {};
    if (context !== undefined && context !== null) {
      const serialized = JSON.stringify(context);
      if (serialized && serialized.length <= MAX_CONTEXT_JSON_LENGTH) {
        safeContext = context;
      }
      // Oversized or unserializable context is dropped rather than
      // rejecting the whole report; the message/stack are still useful.
    }

    const errorId = randomUUID();
    const errorData = {
      message: String(message).slice(0, MAX_MESSAGE_LENGTH),
      stack: typeof stack === "string" ? stack.slice(0, MAX_STACK_LENGTH) : null,
      context: safeContext,
      level: typeof level === "string" ? level.slice(0, 40) : "error",
      userAgent: req.headers.get("user-agent"),
      url: req.headers.get("referer") || "unknown",
      timestamp: new Date().toISOString(),
    };

    // Store in Firestore for debugging
    await commit([createWrite(`client-errors/${errorId}`, errorData)]);

    // Also forward to Sentry (no-op if NEXT_PUBLIC_SENTRY_DSN isn't set —
    // see sentry.server.config.ts) so a real error surfaces as an alert
    // instead of only ever being visible to someone who goes looking in
    // this Firestore collection.
    Sentry.withScope((scope) => {
      scope.setLevel(errorData.level === "warning" ? "warning" : "error");
      scope.setContext("client-error-report", {
        errorId,
        url: errorData.url,
        userAgent: errorData.userAgent,
        extra: safeContext,
      });
      if (errorData.stack) {
        scope.setExtra("originalStack", errorData.stack);
      }
      Sentry.captureMessage(errorData.message);
    });

    return NextResponse.json(
      { id: errorId, status: "logged" },
      { status: 201 }
    );
  } catch (error) {
    // Don't fail the request - log errors silently
    console.error("Failed to log client error:", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

// Generous but real: this is a public, unauthenticated endpoint every page
// calls on error, so it needs a cap well above normal usage that still
// stops a scripted flood from writing unlimited Firestore documents.
export const POST = rateLimit(60, 60_000)(handler);
