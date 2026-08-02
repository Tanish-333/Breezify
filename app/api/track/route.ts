import { NextRequest, NextResponse } from "next/server";
import { commit, incrementWrite } from "@/lib/firestore-rest";

export const runtime = "nodejs";

/**
 * Public, unauthenticated visit-counter beacon for deployed apps (see
 * lib/analytics-snippet.ts). No auth is expected or possible here, the
 * caller is a visitor's browser, not a signed-in Breezify user, so safety
 * comes entirely from firestore.rules scoping this exact write (a +1 to
 * "visits" and nothing else) rather than from anything checked in this
 * route. A bad or missing appId just fails the Firestore write silently,
 * same as any other beacon.
 */
export async function POST(req: NextRequest) {
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
  return new NextResponse(null, { status: 204 });
}
