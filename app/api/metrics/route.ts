import { NextRequest, NextResponse } from "next/server";
import { commit, createWrite } from "@/lib/firestore-rest";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Rate limit: only store every 10th metric to avoid excessive writes
    const random = Math.random();
    if (random > 0.1) {
      return NextResponse.json({ status: "skipped" }, { status: 200 });
    }

    const metricId = randomUUID();
    const metricData = {
      name: body.name,
      value: body.value,
      rating: body.rating,
      delta: body.delta,
      timestamp: body.timestamp || new Date().toISOString(),
      userAgent: req.headers.get("user-agent"),
      url: req.headers.get("referer") || "unknown",
    };

    // Store in Firestore for analytics
    await commit([createWrite(`metrics/${metricId}`, metricData)]);

    return NextResponse.json({ status: "recorded" }, { status: 201 });
  } catch (error) {
    // Silently fail - don't interrupt page functionality
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
