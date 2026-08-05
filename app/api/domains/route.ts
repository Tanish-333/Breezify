import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, getDoc, updateWrite } from "@/lib/firestore-rest";
import {
  addProjectDomain,
  getProjectDomainStatus,
  isDeployConfigured,
  projectSlugFromDeployedUrl,
  removeProjectDomain,
} from "@/lib/vercel-deploy";
import { CUSTOM_DOMAIN_MIN_PLAN, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";

export const runtime = "nodejs";

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

async function authenticate(req: NextRequest) {
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

async function requirePlan(uid: string, idToken: string) {
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
async function loadDeployedApp(appId: string, uid: string, idToken: string) {
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

export async function POST(req: NextRequest) {
  try {
    if (!isDeployConfigured()) {
      return NextResponse.json(
        { error: "Deploys aren't configured on this deployment yet. Set VERCEL_TOKEN." },
        { status: 400 }
      );
    }

    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { appId, domain } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }
    const normalizedDomain = typeof domain === "string" ? domain.trim().toLowerCase() : "";
    if (!DOMAIN_RE.test(normalizedDomain)) {
      return NextResponse.json({ error: "Enter a valid domain, e.g. myapp.com." }, { status: 400 });
    }

    const planError = await requirePlan(uid, idToken);
    if (planError) return planError;

    const loaded = await loadDeployedApp(appId, uid, idToken);
    if (loaded.error) return loaded.error;

    let status;
    try {
      status = await addProjectDomain(loaded.slug, normalizedDomain);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't add that domain.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    await commit(
      [
        updateWrite(
          `apps/${appId}`,
          { customDomain: normalizedDomain, customDomainVerified: status.verified },
          ["customDomain", "customDomainVerified"]
        ),
      ],
      idToken
    );

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add domain.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Re-checks verification status, e.g. after the caller has added the DNS record Vercel asked for. */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const appId = req.nextUrl.searchParams.get("appId");
    if (!appId) return NextResponse.json({ error: "Missing app." }, { status: 400 });

    const loaded = await loadDeployedApp(appId, uid, idToken);
    if (loaded.error) return loaded.error;

    const domain = loaded.doc.fields.customDomain as string | undefined;
    if (!domain) return NextResponse.json({ error: "This app has no custom domain configured." }, { status: 400 });

    let status;
    try {
      status = await getProjectDomainStatus(loaded.slug, domain);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't check that domain's status.";
      return NextResponse.json({ error: message }, { status: 502 });
    }

    if (status.verified !== Boolean(loaded.doc.fields.customDomainVerified)) {
      await commit(
        [updateWrite(`apps/${appId}`, { customDomainVerified: status.verified }, ["customDomainVerified"])],
        idToken
      ).catch(() => {});
    }

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to check domain status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { appId } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }

    const loaded = await loadDeployedApp(appId, uid, idToken);
    if (loaded.error) return loaded.error;

    const domain = loaded.doc.fields.customDomain as string | undefined;
    if (domain) {
      try {
        await removeProjectDomain(loaded.slug, domain);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't remove that domain.";
        return NextResponse.json({ error: message }, { status: 502 });
      }
    }

    await commit(
      [updateWrite(`apps/${appId}`, { customDomain: null, customDomainVerified: false }, ["customDomain", "customDomainVerified"])],
      idToken
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to remove domain.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
