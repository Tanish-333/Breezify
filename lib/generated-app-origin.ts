/**
 * Confirms a claimed origin (window.location.origin from inside some
 * generated app) is actually where that appId is really hosted, before
 * app/api/oauth/google/start hands out a signed state for it. Without
 * this, the start endpoint would be an open relay: anyone could pass
 * appId=<a real app> and origin=https://evil.example and have the
 * resulting Google identity's postMessage delivered to their own page
 * instead of the real app's visitor.
 *
 * The caller here is a generated app's anonymous visitor with no Breezify
 * ID token at all, so — same reasoning as lib/tenant-app.ts and
 * lib/traffic-guard.ts — this goes through the Admin SDK rather than the
 * normal per-user firestore-rest path.
 */
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { getDeployDomain } from "@/lib/deploy-domain";
import { projectSlugFromDeployedUrl } from "@/lib/vercel-deploy";

export async function isOriginForApp(appId: string, origin: string): Promise<boolean> {
  if (!isFirebaseAdminConfigured()) return false;

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = parsed.hostname.toLowerCase();

  const snap = await adminDb().collection("apps").doc(appId).get();
  if (!snap.exists) return false;
  const data = snap.data()!;

  // Free-tier: served on <subdomain>.<DEPLOY_DOMAIN> — see lib/tenant-app.ts.
  const deployDomain = getDeployDomain();
  const subdomain = data.subdomain as string | undefined;
  if (subdomain && deployDomain && host === `${subdomain}.${deployDomain}`.toLowerCase()) {
    return true;
  }

  // A verified custom domain the owner attached (see app/api/domains).
  const customDomain = data.customDomain as string | undefined;
  if (customDomain && data.customDomainVerified && host === customDomain.toLowerCase()) {
    return true;
  }

  // Paid-tier: its own real Vercel project (deployedUrl). Also accept the
  // project's stable "<slug>.vercel.app" alias even when it doesn't match
  // the exact deployedUrl on file — deployedUrl can lag behind a redeploy
  // (see lib/vercel-deploy.ts's tryCleanAlias doc comment) for an app
  // deployed before that got hardened, and a visitor on the real, stable
  // production alias shouldn't be rejected just because Firestore has a
  // stale per-deployment URL cached.
  const deployedUrl = data.deployedUrl as string | undefined;
  if (deployedUrl) {
    try {
      if (host === new URL(deployedUrl).hostname.toLowerCase()) return true;
    } catch {
      // Malformed stored URL — fall through to deny.
    }
    const slug = projectSlugFromDeployedUrl(deployedUrl);
    if (slug && host === `${slug}.vercel.app`) return true;
  }

  return false;
}
