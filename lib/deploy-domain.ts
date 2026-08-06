/**
 * Normalizes DEPLOY_DOMAIN so a common paste mistake — a protocol prefix or
 * trailing slash ("https://breezify.app" or "breezify.app/" instead of
 * just "breezify.app") — doesn't silently break things. Three places read
 * this and each would fail differently on an unnormalized value:
 * middleware.ts's hostname comparison would just never match anything (a
 * silent no-op, the hardest of the three to debug), lib/vercel-deploy.ts's
 * alias attempt would build a garbage hostname, and
 * lib/deploy-actions.ts's free-tier deployedUrl would show visitors a
 * broken link. Dependency-free on purpose: middleware.ts runs on the Edge
 * runtime, where a heavier import would cost real cold-start time for
 * every single request.
 */
export function getDeployDomain(): string | undefined {
  const raw = process.env.DEPLOY_DOMAIN?.trim();
  if (!raw) return undefined;
  return raw
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}
