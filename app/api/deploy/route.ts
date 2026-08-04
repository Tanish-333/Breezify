import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, getDoc, incrementWrite, listCollection, updateWrite } from "@/lib/firestore-rest";
import { withWatermark } from "@/lib/watermark";
import { withAnalytics } from "@/lib/analytics-snippet";
import { deployToVercel, isDeployConfigured } from "@/lib/vercel-deploy";
import { unsupportedReason } from "@/lib/app-support";
import { tryWrapExpressForVercel } from "@/lib/express-adapter";
import { ANALYTICS_MIN_PLAN, DEPLOY_DAILY_LIMIT, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const runtime = "nodejs";
export const maxDuration = 180;

function slugify(appId: string, name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "feather-app";
  return `${base}-${appId.slice(0, 6)}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!isDeployConfigured()) {
      return NextResponse.json(
        { error: "Deploys aren't configured on this deployment yet. Set VERCEL_TOKEN." },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    let uid: string;
    try {
      const verified = await verifyIdToken(idToken);
      if (!verified.emailVerified) {
        return NextResponse.json(
          { error: "Please verify your email before deploying apps." },
          { status: 403 }
        );
      }
      uid = verified.uid;
    } catch {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    const { appId } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }

    const appDoc = await getDoc(`apps/${appId}`, idToken);
    if (!appDoc) {
      return NextResponse.json({ error: "App not found." }, { status: 404 });
    }
    if (appDoc.fields.userId !== uid) {
      return NextResponse.json({ error: "You don't have access to this app." }, { status: 403 });
    }

    const generated = appDoc.fields.generatedCode as { files?: Record<string, string> } | undefined;
    let rawFiles = generated?.files ?? {};
    if (Object.keys(rawFiles).length === 0) {
      return NextResponse.json({ error: "This app has no files to deploy." }, { status: 400 });
    }

    // A simple, single-server-call Express backend can actually run on
    // Vercel once app.listen() is stripped and the app is exported as a
    // serverless function instead — see lib/express-adapter.ts. Anything
    // more complex (its own frontend to route around, WebSockets, multiple
    // servers) is left alone and falls through to the rejection below.
    const wrapped = tryWrapExpressForVercel(rawFiles);
    if (wrapped) rawFiles = wrapped.files;

    // api/ serverless functions and this app's own Secrets are real at
    // deploy time (see below); only a traditional always-on server process
    // is still unsupported, since Vercel functions are request/response
    // only. See lib/app-support.ts.
    const unsupported = unsupportedReason(rawFiles, "deploy");
    if (unsupported) {
      return NextResponse.json({ error: unsupported }, { status: 400 });
    }

    let userPlan: PlanId = "free";
    // Deploys aren't credit-gated (they cost Vercel build/bandwidth, not AI
    // tokens), so track a rolling 24h count directly on the user doc instead.
    // Defaults keep the deploy going if the user doc can't be read at all,
    // rather than blocking on our own error.
    let deployCount = 0;
    let windowStart = new Date();
    let windowActive = false;
    try {
      const userDoc = await getDoc(`users/${uid}`, idToken);
      userPlan = (userDoc?.fields.plan as PlanId) ?? "free";
      const rawWindowStart = userDoc?.fields.deployWindowStart;
      const windowStartMs =
        typeof rawWindowStart === "string" ? Date.parse(rawWindowStart) : NaN;
      windowActive = !Number.isNaN(windowStartMs) && Date.now() - windowStartMs < DAY_MS;
      if (windowActive) {
        windowStart = new Date(windowStartMs);
        deployCount = typeof userDoc?.fields.deployCount === "number" ? userDoc.fields.deployCount : 0;
      }
    } catch {
      // Default to "free" (show the badge) rather than block the deploy.
    }

    const dailyLimit = DEPLOY_DAILY_LIMIT[userPlan];
    if (deployCount >= dailyLimit) {
      const resetInHours = Math.max(1, Math.ceil((windowStart.getTime() + DAY_MS - Date.now()) / (60 * 60 * 1000)));
      return NextResponse.json(
        {
          error: `You've hit today's deploy limit (${dailyLimit}/day on the ${PLANS[userPlan]?.name ?? "Free"} plan). Try again in about ${resetInHours}h, or upgrade for a higher limit.`,
        },
        { status: 429 }
      );
    }

    const name = (appDoc.fields.name as string) || "feather-app";
    const slug = slugify(appId, name);
    const analyticsEnabled = PLAN_RANK[userPlan] >= PLAN_RANK[ANALYTICS_MIN_PLAN];
    const files = withAnalytics(withWatermark(rawFiles, userPlan === "free"), appId, analyticsEnabled);

    // Claim the slot up front, atomically, before the slow (up to 110s)
    // Vercel call rather than after: reading the count, waiting on the
    // deploy, then writing count+1 back left a window where several
    // concurrent requests could all read the same stale count and all slip
    // under the limit. This doesn't fully eliminate the race (two requests
    // in the same instant can still both read before either writes) but
    // shrinks the window from "up to 110 seconds" to "a few milliseconds".
    // A failed deploy still counted here still spent real Vercel build
    // time, so it's correct for it to still count against the cap.
    if (windowActive) {
      await commit([incrementWrite(`users/${uid}`, "deployCount", 1)], idToken);
    } else {
      await commit(
        [
          updateWrite(
            `users/${uid}`,
            { deployCount: 1, deployWindowStart: windowStart },
            ["deployCount", "deployWindowStart"]
          ),
        ],
        idToken
      );
    }

    // This app's own configured Secrets (see components/app-secrets-dialog.tsx)
    // become env vars for its api/ serverless functions only — never for the
    // static frontend build, which has no server-side code to read them.
    let secretsEnv: Record<string, string> = {};
    try {
      const secretDocs = await listCollection(`apps/${appId}/secrets`, idToken);
      secretsEnv = Object.fromEntries(
        secretDocs
          .map((d) => [d.fields.key, d.fields.value])
          .filter(([key, value]) => typeof key === "string" && typeof value === "string")
      );
    } catch {
      // Deploy without secrets rather than blocking on this lookup failing.
    }

    await commit(
      [updateWrite(`apps/${appId}`, { status: "deploying", deployStartedAt: new Date() }, ["status", "deployStartedAt"])],
      idToken
    );

    try {
      const result = await deployToVercel(slug, files, undefined, secretsEnv);
      await commit(
        [
          updateWrite(
            `apps/${appId}`,
            { status: "live", deployedUrl: result.url, deployedAt: new Date() },
            ["status", "deployedUrl", "deployedAt"]
          ),
        ],
        idToken
      );
      return NextResponse.json({ url: result.url });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deploy failed.";
      await commit(
        [updateWrite(`apps/${appId}`, { status: "error", errorMessage: message }, ["status", "errorMessage"])],
        idToken
      ).catch(() => {});
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to deploy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
