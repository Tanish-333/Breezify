/**
 * Turns a raw /api/track request into the small set of dimensions
 * lib/traffic-guard.ts rolls up per app per day (country, referrer,
 * device, path). Every value here is attacker-controlled (an anonymous
 * visitor's browser, headers included), so each function returns a
 * bounded, sanitized bucket rather than the raw input — an arbitrary or
 * spoofed value collapses into "Other"/"/other" instead of minting a new
 * Firestore map key, which keeps a single day's rollup doc from growing
 * without limit under a hostile or just-weird beacon caller.
 */

const HOSTNAME_RE = /^[a-z0-9.-]{1,60}$/;
const PATH_RE = /^\/[a-zA-Z0-9\-_/]{0,60}$/;

/** Vercel's edge sets this on every request automatically; unset off-Vercel (e.g. local dev). */
export function countryFromHeaders(headers: Headers): string {
  const code = headers.get("x-vercel-ip-country");
  return code && /^[A-Z]{2}$/.test(code) ? code : "Unknown";
}

export function deviceFromUserAgent(userAgent: string | null): "mobile" | "desktop" {
  if (!userAgent) return "desktop";
  return /Mobi|Android|iPhone|iPad/i.test(userAgent) ? "mobile" : "desktop";
}

/** "Direct" for no referrer (typed URL, bookmark, app open) or one that fails basic hostname sanity, else the bare hostname. */
export function referrerBucket(referer: string | null): string {
  if (!referer) return "Direct";
  let host: string;
  try {
    host = new URL(referer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "Other";
  }
  return HOSTNAME_RE.test(host) ? host : "Other";
}

/** Strips query/hash and falls back to "/other" for anything that doesn't look like a normal short route. */
export function pathBucket(path: unknown): string {
  if (typeof path !== "string") return "/other";
  const clean = path.split("?")[0].split("#")[0] || "/";
  return PATH_RE.test(clean) ? clean : "/other";
}

/** Firestore map keys can't be empty and dots inside a JS object key are literal, not a nested path — safe here either way, this just keeps them tidy. */
export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}
