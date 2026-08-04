import { NextResponse } from "next/server";
import { getDoc } from "@/lib/firestore-rest";

export const runtime = "nodejs";

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Firestore connectivity check
  try {
    const firebaseTestPath = "health-check";
    const queryStart = Date.now();
    await getDoc(firebaseTestPath, "");
    checks.firestore = {
      status: "ok",
      latency: Date.now() - queryStart,
    };
  } catch {
    checks.firestore = { status: "degraded" };
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
