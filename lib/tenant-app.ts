/**
 * Looks up a free-tier deployed app by its subdomain slug — the read side
 * of lib/deploy-actions.ts' deployFreeTierApp(), used by
 * app/apps/[subdomain]/route.ts (the page middleware.ts rewrites
 * `{slug}.DEPLOY_DOMAIN` requests to).
 *
 * The caller here is an anonymous visitor with no Firebase ID token at
 * all, and firestore.rules has no way to let an unauthenticated reader
 * look up an arbitrary app by subdomain (that would mean opening up public
 * read access to every app doc, generated code included) — so, like
 * lib/traffic-guard.ts, this goes through the Admin SDK. Needs
 * FIREBASE_SERVICE_ACCOUNT configured; without it, free-tier subdomain
 * hosting can't resolve any app at all (see the 503 in the route handler).
 *
 * Cached briefly per subdomain: a viral free-tier app would otherwise mean
 * a Firestore read on every single page load, the same problem
 * lib/traffic-guard.ts solves for the view-cap check.
 */

import { unstable_cache } from "next/cache";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";

const CACHE_REVALIDATE_SECONDS = 60;

export interface TenantApp {
  appId: string;
  files: Record<string, string>;
}

async function loadTenantApp(subdomain: string): Promise<TenantApp | null> {
  if (!isFirebaseAdminConfigured()) return null;
  const db = adminDb();
  const snap = await db.collection("apps").where("subdomain", "==", subdomain).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const files = (doc.get("generatedCode")?.files as Record<string, string>) ?? {};
  return { appId: doc.id, files };
}

export function getTenantApp(subdomain: string): Promise<TenantApp | null> {
  return unstable_cache(loadTenantApp, ["breezify-tenant-app"], {
    revalidate: CACHE_REVALIDATE_SECONDS,
  })(subdomain);
}
