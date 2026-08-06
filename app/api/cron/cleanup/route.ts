import { NextRequest, NextResponse } from "next/server";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

// Vercel Cron: POST /api/cron/cleanup
// Add to vercel.json: { "path": "/api/cron/cleanup", "crons": ["0 2 * * *"] }

// Both collections are public, unauthenticated write targets (see
// firestore.rules — any page load can POST to app/api/metrics or
// app/api/errors) with no cap on total documents, only on write rate. Left
// unpruned they grow forever. Deletes in capped batches per run rather than
// all at once, so a large backlog can't blow past this function's own
// timeout — a slower multi-night catch-up is fine, a function that gets
// killed mid-batch (leaving Firestore in some undefined partial state) is
// not.
const MAX_DELETES_PER_COLLECTION_PER_RUN = 2000;
const FIRESTORE_BATCH_LIMIT = 500;

async function pruneByTimestamp(collectionName: string, olderThanMs: number) {
  const db = adminDb();
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  let deleted = 0;
  // Firestore doesn't support delete-by-query directly; page through
  // matches and batch-delete each page until either the backlog is
  // exhausted or this run's own cap is hit.
  while (deleted < MAX_DELETES_PER_COLLECTION_PER_RUN) {
    const snap = await db
      .collection(collectionName)
      .where("timestamp", "<", cutoff)
      .limit(FIRESTORE_BATCH_LIMIT)
      .get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    deleted += snap.size;
    if (snap.size < FIRESTORE_BATCH_LIMIT) break; // Fewer than a full page: nothing left to page through.
  }
  return deleted;
}

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
  // Queries deployStatus, not status: deploy state moved to its own field
  // (see lib/types.ts' AppStatus doc comment and app/api/deploy/route.ts) so
  // it stops racing a concurrent refine's status updates on the same app.
  const snap = await db.collection("apps").where("deployStatus", "==", "deploying").get();
  const cutoff = Date.now() - STUCK_DEPLOY_MS;
  let cleaned = 0;
  for (const docSnap of snap.docs) {
    const startedAt = docSnap.get("deployStartedAt");
    const startedMs =
      startedAt && typeof startedAt.toMillis === "function" ? startedAt.toMillis() : 0;
    if (startedMs && startedMs < cutoff) {
      await docSnap.ref.update({
        deployStatus: "error",
        deployErrorMessage: "The deploy timed out and didn't finish. Please try again.",
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
    // client-errors and metrics are both public, unauthenticated write
    // targets (see the doc comment on pruneByTimestamp above) with no
    // built-in expiry — this used to be two fake stubs that logged "would
    // delete..." without ever touching either collection, so they grew
    // forever with no pruning actually happening.
    if (!isFirebaseAdminConfigured()) {
      results.errors = { status: "skipped", message: "FIREBASE_SERVICE_ACCOUNT not configured." };
      results.metrics = { status: "skipped", message: "FIREBASE_SERVICE_ACCOUNT not configured." };
    } else {
      try {
        const deleted = await pruneByTimestamp("client-errors", 30 * 24 * 60 * 60 * 1000);
        results.errors = { status: "completed", message: `Deleted ${deleted} client-error log(s) older than 30 days.` };
      } catch (error) {
        results.errors = { status: "error", message: error instanceof Error ? error.message : "Unknown error" };
      }

      try {
        const deleted = await pruneByTimestamp("metrics", 90 * 24 * 60 * 60 * 1000);
        results.metrics = { status: "completed", message: `Deleted ${deleted} metric(s) older than 90 days.` };
      } catch (error) {
        results.metrics = { status: "error", message: error instanceof Error ? error.message : "Unknown error" };
      }
    }

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
