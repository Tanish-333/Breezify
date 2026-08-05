// Shared helpers for the custom-domain routes (attach/check/remove in
// app/api/domains, buy in app/api/domains/purchase, search in
// app/api/domains/search) so ownership/plan/deploy checks aren't
// re-implemented per route.

import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { getDoc } from "@/lib/firestore-rest";
import { projectSlugFromDeployedUrl } from "@/lib/vercel-deploy";
import { CUSTOM_DOMAIN_MIN_PLAN, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";

export async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return { error: NextResponse.json({ error: "Missing authorization token." }, { status: 401 }) };
  }
  try {
    const uid = (await verifyIdToken(idToken)).uid;
    return { uid, idToken };
  } catch {
    return {
      error: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }),
    };
  }
}

export async function requirePlan(uid: string, idToken: string) {
  const userDoc = await getDoc(`users/${uid}`, idToken);
  const plan = (userDoc?.fields.plan as PlanId) ?? "free";
  if (PLAN_RANK[plan] < PLAN_RANK[CUSTOM_DOMAIN_MIN_PLAN]) {
    return NextResponse.json(
      { error: `Custom domains are available on the ${PLANS[CUSTOM_DOMAIN_MIN_PLAN].name} plan and above.` },
      { status: 403 }
    );
  }
  return null;
}

/** Loads the app, checks ownership, and pulls out the Vercel project slug it's actually deployed to. */
export async function loadDeployedApp(appId: string, uid: string, idToken: string) {
  const doc = await getDoc(`apps/${appId}`, idToken);
  if (!doc) return { error: NextResponse.json({ error: "App not found." }, { status: 404 }) };
  if (doc.fields.userId !== uid) {
    return { error: NextResponse.json({ error: "You don't have access to this app." }, { status: 403 }) };
  }
  const deployedUrl = doc.fields.deployedUrl as string | undefined;
  if (!deployedUrl) {
    return {
      error: NextResponse.json(
        { error: "Deploy this app first, then attach a custom domain to it." },
        { status: 400 }
      ),
    };
  }
  const slug = projectSlugFromDeployedUrl(deployedUrl);
  if (!slug) {
    return { error: NextResponse.json({ error: "Couldn't determine this app's Vercel project." }, { status: 500 }) };
  }
  return { doc, slug };
}

export const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;
