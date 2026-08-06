import { NextRequest, NextResponse } from "next/server";
import { checkAndRecordView } from "@/lib/traffic-guard";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Every deployed app lives on its own origin (a *.breezify.app subdomain or
// a fully custom domain — see lib/vercel-deploy.ts), never the main app's
// origin, so this is a genuine cross-origin request. Its POST body carries
// nothing sensitive (just an appId) and the response carries nothing but a
// boolean, so a wide-open CORS policy is fine — but it does need to
// actually be present, or the browser drops both the preflight and the
// response silently and this beacon never fires at all.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Public, unauthenticated visit-counter + traffic-cap beacon for deployed
 * apps (see lib/analytics-snippet.ts). No auth is expected or possible
 * here — the caller is a visitor's browser, not a signed-in Breezify user —
 * so safety comes entirely from firestore.rules scoping the public fallback
 * write (see lib/traffic-guard.ts) rather than from anything checked here.
 * A bad or missing appId just reports "not blocked" and does nothing else,
 * same as any other beacon swallowing a malformed hit.
 */
async function handler(req: NextRequest) {
  try {
    const { appId } = await req.json();
    if (typeof appId === "string" && appId.length > 0 && appId.length < 200) {
      const { blocked, reason } = await checkAndRecordView(appId);
      return NextResponse.json({ blocked, reason }, { headers: CORS_HEADERS });
    }
  } catch {
    // Malformed body from a non-standard caller; nothing to do.
  }
  return NextResponse.json({ blocked: false }, { headers: CORS_HEADERS });
}

// Generous: real deployed apps can get real bursts of traffic, and many
// visitors can share one IP behind a NAT/corporate proxy. This is here to
// stop a scripted flood from inflating one app's visit count or running up
// Firestore write costs, not to throttle normal usage.
const limited = rateLimit(300, 60_000)(handler);

export async function POST(req: NextRequest) {
  const res = await limited(req);
  for (const [key, value] of Object.entries(CORS_HEADERS)) res.headers.set(key, value);
  return res;
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
