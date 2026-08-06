/**
 * Free-tier traffic cap (MONTHLY_PAGE_VIEW_LIMIT) and deploy expiry
 * (DEPLOY_EXPIRY_DAYS, see lib/types.ts) for deployed apps. Every deployed
 * app carries a tiny beacon (lib/analytics-snippet.ts) that hits POST
 * /api/track once per page load; that route calls checkAndRecordView()
 * here, which both bumps the view counters and reports whether this app is
 * currently blocked (over its plan's traffic cap, or past its
 * deployExpiresAt with no renewal — see app/api/apps/[appId]/renew) so the
 * visitor can be redirected to /limit-reached instead.
 *
 * Reading the app + its owner's plan on every single page load would flood
 * Firestore, so the "is this app currently blocked" check is wrapped in
 * unstable_cache with a short revalidate window — a busy app's traffic
 * never means a database read on every page load, just one read per app
 * per cache window; the write side (recordView) still happens every time,
 * but that's a single, cheap increment, not a read+compute.
 *
 * Needs FIREBASE_SERVICE_ACCOUNT (the Admin SDK): the beacon is called by
 * an anonymous visitor's browser with no Firebase ID token at all, and
 * firestore.rules only lets an unauthenticated caller increment the public
 * `visits` field (see app/api/track and the apps/{appId} update rule) — it
 * can't read the owner's plan or roll a monthly window on its own. Without
 * FIREBASE_SERVICE_ACCOUNT configured, this fails OPEN: views still count
 * via the public `visits` increment, but the monthly cap is never enforced.
 */

import { unstable_cache } from "next/cache";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { commit, incrementWrite } from "@/lib/firestore-rest";
import { isDeployExpired, MONTHLY_PAGE_VIEW_LIMIT, type PlanId } from "@/lib/types";

const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CACHE_REVALIDATE_SECONDS = 60;

interface TrafficStatus {
  blocked: boolean;
  /** Why, when blocked — lets the redirect (lib/analytics-snippet.ts) send visitors to the right explanation on /limit-reached. */
  reason?: "traffic" | "expired";
}

function toMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in (value as object)) {
    return (value as { toMillis: () => number }).toMillis();
  }
  return 0;
}

async function loadTrafficStatus(appId: string): Promise<TrafficStatus> {
  const db = adminDb();
  const appSnap = await db.collection("apps").doc(appId).get();
  if (!appSnap.exists) return { blocked: false };

  const app = appSnap.data()!;

  // Checked before the traffic cap: an expired, unrenewed app should say so
  // rather than a generic "traffic limit" message, even if it also happens
  // to be over its view cap.
  const expiresAt = app.deployExpiresAt ? toMillis(app.deployExpiresAt) : undefined;
  if (isDeployExpired(expiresAt)) return { blocked: true, reason: "expired" };

  const ownerId = app.userId as string | undefined;
  let plan: PlanId = "free";
  if (ownerId) {
    const userSnap = await db.collection("users").doc(ownerId).get();
    plan = (userSnap.data()?.plan as PlanId) ?? "free";
  }

  const limit = MONTHLY_PAGE_VIEW_LIMIT[plan];
  if (limit === null) return { blocked: false };

  const windowExpired = Date.now() - toMillis(app.monthlyViewsWindowStart) > WINDOW_MS;
  const monthlyViews = windowExpired ? 0 : ((app.monthlyViews as number) ?? 0);
  return monthlyViews >= limit ? { blocked: true, reason: "traffic" } : { blocked: false };
}

/** Cached per app for CACHE_REVALIDATE_SECONDS so a busy app doesn't mean a Firestore read on every page load. */
const getCachedTrafficStatus = (appId: string) =>
  unstable_cache(loadTrafficStatus, ["breezify-traffic-status"], {
    revalidate: CACHE_REVALIDATE_SECONDS,
  })(appId);

/**
 * Records one page view. When the Admin SDK is configured, this rolls the
 * monthly window inside a transaction — resetting it once WINDOW_MS has
 * passed since monthlyViewsWindowStart — so concurrent visitors can't race
 * past a reset and all get counted as "the first view of a new window."
 * Falls back to the public, rules-scoped `visits` increment (see
 * app/api/track) when Admin isn't configured: the lifetime count still
 * moves, the monthly cap just can't be evaluated.
 */
async function recordView(appId: string): Promise<void> {
  if (!isFirebaseAdminConfigured()) {
    await commit([incrementWrite(`apps/${appId}`, "visits", 1)]).catch(() => {});
    return;
  }

  const db = adminDb();
  const ref = db.collection("apps").doc(appId);
  await db
    .runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const data = snap.data()!;
      const windowExpired = Date.now() - toMillis(data.monthlyViewsWindowStart) > WINDOW_MS;
      tx.update(ref, {
        visits: ((data.visits as number) ?? 0) + 1,
        monthlyViews: windowExpired ? 1 : ((data.monthlyViews as number) ?? 0) + 1,
        ...(windowExpired ? { monthlyViewsWindowStart: new Date() } : {}),
      });
    })
    .catch(() => {
      // A beacon failure must never surface to the visitor — see app/api/track.
    });
}

/** Records this view and reports whether the app should now redirect the visitor to /limit-reached, and why. */
export async function checkAndRecordView(appId: string): Promise<TrafficStatus> {
  const status = await getCachedTrafficStatus(appId);
  // Still record the view even when already blocked — it's the same real
  // visit either way, and keeps the count accurate for once the owner
  // upgrades, renews, or the window rolls over.
  await recordView(appId);
  return status;
}
