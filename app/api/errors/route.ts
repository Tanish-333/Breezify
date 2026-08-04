import { NextRequest, NextResponse } from "next/server";
import { commit, createWrite } from "@/lib/firestore-rest";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, stack, context, level } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Missing message field" },
        { status: 400 }
      );
    }

    const errorId = randomUUID();
    const errorData = {
      message,
      stack: stack || null,
      context: context || {},
      level: level || "error",
      userAgent: req.headers.get("user-agent"),
      url: req.headers.get("referer") || "unknown",
      timestamp: new Date().toISOString(),
    };

    // Store in Firestore for debugging
    await commit([createWrite(`client-errors/${errorId}`, errorData)]);

    // In production, also send to external error tracking service
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      // Would send to Sentry here
    }

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
