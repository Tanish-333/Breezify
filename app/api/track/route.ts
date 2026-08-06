import { NextRequest, NextResponse } from "next/server";
import { commit, incrementWrite } from "@/lib/firestore-rest";
import { rateLimit } from "@/lib/rate-limit";
import { corsPreflight, withCors } from "@/lib/cors";

export const runtime = "nodejs";

export async function OPTIONS() {
  return corsPreflight();
}

/**
 * Public, unauthenticated visit-counter beacon for deployed apps (see
 * lib/analytics-snippet.ts). No auth is expected or possible here, the
 * caller is a visitor's browser, not a signed-in Breezify user, so safety
 * comes entirely from firestore.rules scoping this exact write (a +1 to
 * "visits" and nothing else) rather than from anything checked in this
 * route. A bad or missing appId just fails the Firestore write silently,
 * same as any other beacon.
 *
 * The beacon always runs on the deployed app's own separate *.vercel.app
 * origin, never this one, and sends `Content-Type: application/json` —
 * which makes it a CORS-preflighted request. Without the OPTIONS handler
 * and withCors() below, every browser silently blocked the preflight,
 * meaning this beacon never once completed on any deployed app: visit
 * counts stayed at 0 regardless of real traffic, with nothing in the UI
 * to explain why.
 */
async function handler(req: NextRequest) {
  try {
    const { appId } = await req.json();
    if (typeof appId === "string" && appId.length > 0 && appId.length < 200) {
      await commit([incrementWrite(`apps/${appId}`, "visits", 1)]).catch(() => {});
    }
  } catch {
    // Malformed body from a non-standard caller; nothing to do.
  }
  // Always 204, regardless of outcome: this is a fire-and-forget beacon
  // and nothing about its result is meaningful to the visitor's browser.
  return withCors(new NextResponse(null, { status: 204 }));
}

// Generous: real deployed apps can get real bursts of traffic, and many
// visitors can share one IP behind a NAT/corporate proxy. This is here to
// stop a scripted flood from inflating one app's visit count or running up
// Firestore write costs, not to throttle normal usage.
export const POST = rateLimit(300, 60_000)(handler);
