import { NextResponse } from "next/server";

/**
 * CORS for app/api/app-data/*, the persistence backend generated apps use
 * (see lib/generation/prompt.ts's DATA section). Every caller here is,
 * by design, running on a different origin than this app itself: the
 * sandboxed live preview has an opaque `null` origin (no allow-same-origin
 * on its iframe), and every deployed generated app lives on its own
 * separate *.vercel.app domain, never this one. Without CORS headers on
 * every response (including preflight), the browser silently blocks the
 * generated app's JS from ever reading the response — no error surfaces
 * anywhere, it just looks like the request never came back, which is
 * indistinguishable from a stuck loading state. Wide open (`*`) is
 * intentional: this route has no way to know in advance which arbitrary
 * generated-app origin will call it, and it isn't cookie/session
 * authenticated anyway (every write carries its own Firebase ID token).
 */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Wraps an existing NextResponse, adding the CORS headers every app-data response needs. */
export function withCors(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}
