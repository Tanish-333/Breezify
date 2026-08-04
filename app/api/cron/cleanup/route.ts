import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Vercel Cron: POST /api/cron/cleanup
// Add to vercel.json: { "path": "/api/cron/cleanup", "crons": ["0 2 * * *"] }

export async function POST(req: NextRequest) {
  // Verify this is called by Vercel's cron service
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    // Clean up temporary/failed app builds
    results.builds = {
      status: "completed",
      message: "Would clean up failed builds",
    };

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
