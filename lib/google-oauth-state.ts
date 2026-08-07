/**
 * Short-lived, signed state for the Google sign-in proxy (see
 * app/api/oauth/google/start and .../callback). Carries which generated
 * app + which origin a sign-in belongs to from the redirect out to Google
 * and back, without a database round trip. HMAC-signed with
 * GOOGLE_OAUTH_CLIENT_SECRET (already a secret nobody else has, no reason
 * to provision a second one just for this) so it can't be forged into
 * claiming a different app/origin than /start actually validated.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 5 * 60 * 1000;

export interface OAuthState {
  appId: string;
  /** The generated app's own origin, already validated against that app's real deployment by /start — this is what /callback's postMessage targetOrigin trusts. */
  origin: string;
}

function secret(): string {
  const s = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!s) throw new Error("GOOGLE_OAUTH_CLIENT_SECRET isn't configured.");
  return s;
}

function sign(encoded: string): Buffer {
  return createHmac("sha256", secret()).update(encoded).digest();
}

export function signState(state: OAuthState): string {
  const payload = JSON.stringify({
    ...state,
    exp: Date.now() + STATE_TTL_MS,
    // Not read back anywhere — just enough entropy that two state tokens
    // for the same app/origin/instant never encode to the same string.
    nonce: randomBytes(8).toString("hex"),
  });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  const sig = sign(encoded).toString("base64url");
  return `${encoded}.${sig}`;
}

/** Null on anything wrong: bad signature, expired, malformed — every case gets the same generic "expired or invalid" treatment from the caller. */
export function verifyState(token: string): OAuthState | null {
  const [encoded, sig] = token.split(".");
  if (!encoded || !sig) return null;

  const expected = sign(encoded);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (typeof payload.appId !== "string" || typeof payload.origin !== "string") return null;
    return { appId: payload.appId, origin: payload.origin };
  } catch {
    return null;
  }
}
