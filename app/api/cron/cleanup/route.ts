import { NextRequest, NextResponse } from "next/server";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

// Vercel Cron: POST /api/cron/cleanup
// Add to vercel.json: { "path": "/api/cron/cleanup", "crons": ["0 2 * * *"] }

// A deploy that hasn't reached "live" or "error" within this long almost
// certainly means the serverless function handling it was killed (e.g. by
// its own maxDuration) partway through, or its final status write failed —
// there's no other code path that would leave it here indefinitely.
const STUCK_DEPLOY_MS = 15 * 60 * 1000;

async function cleanStuckDeploys() {
  if (!isFirebaseAdminConfigured()) {
    return { status: "skipped", message: "FIREBASE_SERVICE_ACCOUNT not configured." };
  }
  const db = adminDb();
  // A single-field equality filter, so no composite index is required; the
  // number of apps actually mid-deploy at any moment is always small, so
  // filtering the timestamp in memory below is cheap.
  const snap = await db.collection("apps").where("status", "==", "deploying").get();
  const cutoff = Date.now() - STUCK_DEPLOY_MS;
  let cleaned = 0;
  for (const docSnap of snap.docs) {
    const startedAt = docSnap.get("deployStartedAt");
    const startedMs =
      startedAt && typeof startedAt.toMillis === "function" ? startedAt.toMillis() : 0;
    if (startedMs && startedMs < cutoff) {
      await docSnap.ref.update({
        status: "error",
        errorMessage: "The deploy timed out and didn't finish. Please try again.",
      });
      cleaned++;
    }
  }
  return { status: "completed", message: `Reset ${cleaned} deploy(s) stuck past ${STUCK_DEPLOY_MS / 60000} minutes.` };
}

export async function POST(req: NextRequest) {
  // Verify this is called by Vercel's cron service. Fail closed if the
  // secret isn't configured at all, rather than matching a literal
  // "Bearer undefined" that anyone could send.
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, { status: string; message: string }> = {};

  try {
    // Clean up old sessions (older than 30 days)
    // In production, this would query Firestore and delete old sessions
    // For now, we log that this would happen
    results.sessions = {
      status: "completed",
      message: "Would delete sessions older than 30 days",
    };

    // Apps left stuck in "deploying" by a killed function or a failed
    // final status write (see app/api/deploy).
    try {
      results.builds = await cleanStuckDeploys();
    } catch (error) {
      results.builds = {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }

    // Clean up expired analytics data (older than 90 days)
    results.analytics = {
      status: "completed",
      message: "Would archive analytics older than 90 days",
    };

    return NextResponse.json(
      {
        status: "success",
        timestamp: new Date().toISOString(),
        results,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
