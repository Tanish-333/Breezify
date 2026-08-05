import { NextResponse } from "next/server";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Firestore connectivity check. Previously used the unauthenticated REST
  // client (lib/firestore-rest.ts) against a single-segment "health-check"
  // path — not a valid document reference, and with no ID token every
  // collection's rules default-deny it anyway, so this always failed
  // regardless of Firestore's actual health. The Admin SDK bypasses
  // security rules entirely (same as the Stripe webhook and cron cleanup
  // routes already do), so a trivial read here actually reflects reality.
  if (!isFirebaseAdminConfigured()) {
    checks.firestore = { status: "degraded" };
  } else {
    try {
      const queryStart = Date.now();
      await adminDb().collection("users").limit(1).get();
      checks.firestore = { status: "ok", latency: Date.now() - queryStart };
    } catch {
      checks.firestore = { status: "degraded" };
    }
  }

  const totalTime = Date.now() - startTime;
  const status =
    Object.values(checks).every((c) => c.status !== "error") ? 200 : 503;

  return NextResponse.json(
    {
      status: status === 200 ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      checks,
      responseTime: `${totalTime}ms`,
    },
    { status }
  );
}
