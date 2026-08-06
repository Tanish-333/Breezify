import { NextRequest, NextResponse } from "next/server";
import { checkAndRecordView } from "@/lib/traffic-guard";
import { rateLimit } from "@/lib/rate-limit";
import { corsPreflight, withCors } from "@/lib/cors";

export const runtime = "nodejs";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * Public, unauthenticated visit-counter + traffic-cap beacon for deployed
 * apps (see lib/analytics-snippet.ts). No auth is expected or possible
 * here — the caller is a visitor's browser, not a signed-in Breezify user —
 * so safety comes entirely from firestore.rules scoping the public fallback
 * write (see lib/traffic-guard.ts) rather than from anything checked here.
 *
 * The beacon always runs on the deployed app's own separate origin (a
 * *.breezify.app subdomain, or a fully custom domain), never this one, and
 * sends `Content-Type: application/json` — which makes it a
 * CORS-preflighted request. Without the OPTIONS handler and withCors()
 * below, every browser silently blocked the preflight, meaning this beacon
 * never once completed on any deployed app: visit counts stayed at 0
 * regardless of real traffic, and the traffic-cap/expiry redirect could
 * never fire either, with nothing in the UI to explain why.
 */
async function handler(req: NextRequest) {
  try {
    const { appId, path } = await req.json();
    if (typeof appId === "string" && appId.length > 0 && appId.length < 200) {
      const { blocked, reason } = await checkAndRecordView(appId, {
        path,
        referer: req.headers.get("referer"),
        userAgent: req.headers.get("user-agent"),
        headers: req.headers,
      });
      return withCors(NextResponse.json({ blocked, reason }));
    }
  } catch {
    // Malformed body from a non-standard caller; nothing to do.
  }
  return withCors(NextResponse.json({ blocked: false }));
}

// Generous: real deployed apps can get real bursts of traffic, and many
// visitors can share one IP behind a NAT/corporate proxy. This is here to
// stop a scripted flood from inflating one app's visit count or running up
// Firestore write costs, not to throttle normal usage.
export const POST = rateLimit(300, 60_000)(handler);
