// Free-tier business rules around deploying, undeploying, and deleting an
// app: the active-subdomain cap (MAX_ACTIVE_DEPLOYED_APPS in lib/types.ts)
// and the two ways a user frees a slot to deploy a new one. Both
// app/api/deploy (the cap check) and app/api/apps/[appId] (delete/undeploy)
// build on the counting logic here so the rule can't drift between call
// sites — see each export's own doc comment.

import {
  commit,
  deleteWrite,
  getDoc,
  listCollection,
  queryCollection,
  updateWrite,
} from "@/lib/firestore-rest";
import { removeProjectDomain, projectSlugFromDeployedUrl } from "@/lib/vercel-deploy";
import { getDeployDomain } from "@/lib/deploy-domain";
import {
  isActiveDeployment,
  MAX_ACTIVE_DEPLOYED_APPS,
  PLANS,
  type AppStatus,
  type DeployStatus,
  type PlanId,
} from "@/lib/types";

/** Thrown by deployNewApp() when the caller's plan is already at MAX_ACTIVE_DEPLOYED_APPS. Its message is safe to show the user directly. */
export class DeployLimitError extends Error {}

/** Every app doc owned by `uid`, read with the caller's own idToken so firestore.rules scopes this to their own docs (see the apps/{appId} read rule). */
async function listOwnApps(uid: string, idToken: string) {
  return queryCollection("apps", "userId", uid, idToken);
}

/** How many of the user's apps currently hold a live subdomain slot. */
export async function countActiveDeployedApps(uid: string, idToken: string): Promise<number> {
  const apps = await listOwnApps(uid, idToken);
  return apps.filter((a) =>
    isActiveDeployment({
      status: a.fields.status as AppStatus,
      deployStatus: a.fields.deployStatus as DeployStatus | undefined,
    })
  ).length;
}

/**
 * The free-tier gate a deploy must pass before it's allowed to claim a NEW
 * subdomain slot. Called from app/api/deploy/route.ts before it talks to
 * Vercel at all. A redeploy of an app that's already live doesn't consume a
 * new slot (pass alreadyLive: true to skip the check entirely) — this only
 * ever blocks the deploy that would make a (cap + 1)th app live at once,
 * whether that's a brand-new app or a redeploy of one the user previously
 * undeployed or deleted down to make room.
 */
export async function deployNewApp(params: {
  uid: string;
  idToken: string;
  plan: PlanId;
  alreadyLive: boolean;
}): Promise<void> {
  const { uid, idToken, plan, alreadyLive } = params;
  if (alreadyLive) return;

  const cap = MAX_ACTIVE_DEPLOYED_APPS[plan];
  if (cap === null) return;

  const active = await countActiveDeployedApps(uid, idToken);
  if (active >= cap) {
    throw new DeployLimitError(
      `You've reached the ${PLANS[plan].name} plan limit of ${cap} live app${cap === 1 ? "" : "s"}. ` +
        `Delete or undeploy an existing app to free up a slot, or upgrade for more.`
    );
  }
}

/**
 * Deterministic, always-unique subdomain slug for an app: name-derived for
 * readability, with a slice of the app's own id appended so no two apps
 * ever collide — no "this subdomain is already taken" case can occur, by
 * construction, so there's nothing to check for it. Shared by both hosting
 * paths (this file's deployFreeTierApp and app/api/deploy's real Vercel
 * deploy) so an app's URL slug stays identical whichever one is serving it,
 * including across a later upgrade from one to the other.
 */
export function subdomainSlug(appId: string, name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "breezify-app";
  return `${base}-${appId.slice(0, 6)}`;
}

/**
 * Deploys a Free-plan app WITHOUT spending a Vercel project on it. Every
 * generated app is normally deployed as its own real Vercel project (see
 * app/api/deploy/route.ts and lib/vercel-deploy.ts) — that's what gets
 * real backend support and a real SSL cert, but it also burns one of a
 * limited number of projects (200 on Vercel Hobby, shared by every user's
 * every app) per deploy. That ceiling is the actual limit on how many
 * total users Breezify can support on a free/Hobby Vercel plan, long
 * before MAX_ACTIVE_DEPLOYED_APPS or any traffic cap becomes the
 * bottleneck.
 *
 * Free-tier apps instead get served by ONE shared Vercel project (this
 * Next.js app itself): middleware.ts rewrites `{slug}.DEPLOY_DOMAIN`
 * requests to app/apps/[subdomain]/route.ts, which looks the app up by its
 * `subdomain` field and renders its files with the exact same
 * lib/preview.ts `buildPreview()` the dashboard's live preview already
 * uses (Babel standalone in the browser, no server build step) — so an
 * unbounded number of free-tier apps costs a constant one Vercel project,
 * not one each. The real tradeoff: no real backend (an api/ folder still
 * renders with a banner, exactly like the dashboard preview, but its
 * requests have nothing to answer them) and no real per-app custom domain.
 * Paid plans keep the real-Vercel-project path for exactly that reason.
 */
export async function deployFreeTierApp(params: {
  appId: string;
  idToken: string;
  name: string;
  /** Skips restarting the expiry clock on an ordinary redeploy — see the matching comment in app/api/deploy/route.ts. */
  alreadyLive: boolean;
  expiryDays: number | null;
}): Promise<{ url: string }> {
  const { appId, idToken, name, alreadyLive, expiryDays } = params;
  const slug = subdomainSlug(appId, name);
  const domain = getDeployDomain();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://breezify.vercel.app";
  // The real subdomain once DEPLOY_DOMAIN is set and middleware.ts is
  // routing it (see that file); a same-origin path before then, so this is
  // usable and testable immediately, not blocked on the domain purchase.
  const url = domain ? `https://${slug}.${domain}` : `${appUrl}/apps/${slug}`;

  const deployExpiresAt =
    !alreadyLive && expiryDays !== null
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
      : undefined;

  const fields: Record<string, unknown> = {
    subdomain: slug,
    deployStatus: "live",
    deployedUrl: url,
    deployedAt: new Date(),
    ...(deployExpiresAt ? { deployExpiresAt } : {}),
  };
  await commit([updateWrite(`apps/${appId}`, fields, Object.keys(fields))], idToken);
  return { url };
}

/** Detaches a deployed app's Vercel project domain, if it has one. Best-effort: swallows failures so the caller (undeploy/delete) still succeeds even if the domain was already gone on Vercel's side. */
async function tryDetachDomain(fields: Record<string, unknown>): Promise<void> {
  const deployedUrl = fields.deployedUrl as string | undefined;
  const customDomain = fields.customDomain as string | undefined;
  if (!deployedUrl || !customDomain) return;
  const slug = projectSlugFromDeployedUrl(deployedUrl);
  if (!slug) return;
  await removeProjectDomain(slug, customDomain).catch(() => {});
}

/**
 * Takes an app offline without deleting it: clears its deploy state so it
 * stops counting against MAX_ACTIVE_DEPLOYED_APPS, but keeps the app, its
 * generated code, and its turn history intact so it can be redeployed later
 * (subject to the cap again at that point, same as any other deploy). Also
 * detaches any custom domain, since a domain can't stay usefully pointed at
 * a project with nothing live on it.
 */
export async function undeployApp(params: { appId: string; uid: string; idToken: string }): Promise<void> {
  const { appId, uid, idToken } = params;
  const appDoc = await getDoc(`apps/${appId}`, idToken);
  if (!appDoc) throw new Error("App not found.");
  if (appDoc.fields.userId !== uid) throw new Error("You don't have access to this app.");

  await tryDetachDomain(appDoc.fields);

  const fields = {
    deployStatus: "error" as const,
    deployErrorMessage: "Undeployed — redeploy any time.",
    deployedUrl: null,
    deployExpiresAt: null,
    subdomain: null,
    customDomain: null,
    customDomainVerified: false,
    domainPurchased: false,
    domainExpiresAt: null,
    domainAutoRenew: false,
    domainOrderId: null,
  };
  await commit([updateWrite(`apps/${appId}`, fields, Object.keys(fields))], idToken);
}

// Firestore's REST commit caps at 500 writes per request, same limit the
// client SDK's writeBatch enforces.
const COMMIT_WRITE_LIMIT = 450;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Deletes an app entirely: its Vercel project domain (best-effort), its
 * secrets/versions/collaborators/analytics subcollections (Firestore never
 * cascade-deletes these), and finally the app doc itself. Always frees a
 * slot, the same as undeployApp, but with no way back.
 */
export async function deleteApp(params: { appId: string; uid: string; idToken: string }): Promise<void> {
  const { appId, uid, idToken } = params;
  const appDoc = await getDoc(`apps/${appId}`, idToken);
  if (!appDoc) throw new Error("App not found.");
  if (appDoc.fields.userId !== uid) throw new Error("You don't have access to this app.");

  await tryDetachDomain(appDoc.fields);

  const [secrets, versions, collaborators, analytics] = await Promise.all([
    listCollection(`apps/${appId}/secrets`, idToken),
    listCollection(`apps/${appId}/versions`, idToken),
    listCollection(`apps/${appId}/collaborators`, idToken),
    listCollection(`apps/${appId}/analytics`, idToken),
  ]);
  const subPaths = [
    ...secrets.map((d) => `apps/${appId}/secrets/${d.id}`),
    ...versions.map((d) => `apps/${appId}/versions/${d.id}`),
    ...collaborators.map((d) => `apps/${appId}/collaborators/${d.id}`),
    ...analytics.map((d) => `apps/${appId}/analytics/${d.id}`),
  ];

  for (const group of chunk(subPaths, COMMIT_WRITE_LIMIT)) {
    await commit(group.map(deleteWrite), idToken);
  }
  await commit([deleteWrite(`apps/${appId}`)], idToken);
}
