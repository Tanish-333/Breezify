import { NextRequest, NextResponse } from "next/server";
import { commit, createWrite } from "@/lib/firestore-rest";
import { rateLimit } from "@/lib/rate-limit";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const VALID_METRIC_NAMES = new Set(["CLS", "INP", "FCP", "LCP", "TTFB"]);
const VALID_RATINGS = new Set(["good", "needs-improvement", "poor"]);

async function handler(req: NextRequest) {
  try {
    const body = await req.json();

    if (
      typeof body.name !== "string" ||
      !VALID_METRIC_NAMES.has(body.name) ||
      typeof body.value !== "number" ||
      !Number.isFinite(body.value) ||
      typeof body.rating !== "string" ||
      !VALID_RATINGS.has(body.rating) ||
      typeof body.delta !== "number" ||
      !Number.isFinite(body.delta)
    ) {
      return NextResponse.json({ error: "Invalid metric payload" }, { status: 400 });
    }

    // Sampled, not rate-limited: this only reduces how much of *legitimate*
    // traffic gets stored. The rateLimit() wrapper below is what actually
    // caps how many requests a single caller can make in the first place.
    if (Math.random() > 0.1) {
      return NextResponse.json({ status: "skipped" }, { status: 200 });
    }

    const metricId = randomUUID();
    const metricData = {
      name: body.name,
      value: body.value,
      rating: body.rating,
      delta: body.delta,
      // Server time, not the client-supplied one: authoritative, and keeps
      // this field from being used to write arbitrary/malformed data.
      timestamp: new Date().toISOString(),
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

export const POST = rateLimit(60, 60_000)(handler);
