/**
 * Normalizes NEXT_PUBLIC_APP_URL the same way lib/deploy-domain.ts
 * normalizes DEPLOY_DOMAIN: a trailing slash is a common paste mistake
 * ("https://breezify.vercel.app/" instead of "https://breezify.vercel.app")
 * that silently breaks anything built by string-concatenating a path onto
 * it — a doubled "//" between the base and the path. That's exactly fatal
 * for app/api/oauth/google/{start,callback}'s redirect_uri: Google matches
 * it byte-for-byte against whatever's registered on the OAuth client, so
 * "https://host//api/oauth/google/callback" against a registered
 * "https://host/api/oauth/google/callback" is a hard redirect_uri_mismatch,
 * not a redirect. Every other reader of NEXT_PUBLIC_APP_URL (Stripe return
 * URLs, the sitemap, watermark/analytics links, generated apps' inlined
 * base URL) has the same latent bug even though it fails less loudly there.
 */
export function getAppBaseUrl(requestOrigin?: string): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return requestOrigin || "https://breezify.dev";
}
