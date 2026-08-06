import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, getDoc, incrementWrite, listCollection, updateWrite } from "@/lib/firestore-rest";
import { hasAppAccess } from "@/lib/app-collaborators";
import { withWatermark } from "@/lib/watermark";
import { withAnalytics } from "@/lib/analytics-snippet";
import { deployToVercel, isDeployConfigured } from "@/lib/vercel-deploy";
import { unsupportedReason } from "@/lib/app-support";
import { tryWrapExpressForVercel } from "@/lib/express-adapter";
import { missingEnvVars } from "@/lib/backend-env";
import { deployNewApp, DeployLimitError } from "@/lib/deploy-actions";
import {
  DEPLOY_DAILY_LIMIT,
  DEPLOY_EXPIRY_DAYS,
  PLANS,
  isActiveDeployment,
  type AppStatus,
  type DeployStatus,
  type PlanId,
} from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export const runtime = "nodejs";
export const maxDuration = 180;

function slugify(appId: string, name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "breezify-app";
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
    if (!(await hasAppAccess(appId, appDoc.fields.userId as string, uid, idToken))) {
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

    // Free-tier active-subdomain cap (MAX_ACTIVE_DEPLOYED_APPS): only ever
    // blocks a deploy that would claim a NEW slot, never a redeploy of an
    // app that's already live — see lib/deploy-actions.ts.
    const alreadyLive = isActiveDeployment({
      status: appDoc.fields.status as AppStatus,
      deployStatus: appDoc.fields.deployStatus as DeployStatus | undefined,
    });
    try {
      await deployNewApp({ uid, idToken, plan: userPlan, alreadyLive });
    } catch (err) {
      if (err instanceof DeployLimitError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      throw err;
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

    const name = (appDoc.fields.name as string) || "breezify-app";
    const slug = slugify(appId, name);
    // The tracking beacon isn't a Pro+ perk: it's also how the free tier's
    // MONTHLY_PAGE_VIEW_LIMIT gets enforced (see lib/traffic-guard.ts), so
    // every plan gets it now, not just the ones that get to see the count.
    const files = withAnalytics(withWatermark(rawFiles, userPlan === "free"), appId);

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
    let secretsNote: string | undefined;
    const isAppOwner = appDoc.fields.userId === uid;
    if (isAppOwner) {
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
      // A backend function reading an env var nobody configured deploys
      // clean today — Vercel has nothing to reject — and only fails once a
      // visitor actually hits that code path, as an undifferentiated 500
      // with no obvious cause. Catch it here instead. Checked against
      // rawFiles (the real api/ source), not the watermark/analytics-
      // injected `files` below, which only ever touch static HTML.
      const missing = missingEnvVars(rawFiles, Object.keys(secretsEnv));
      if (missing.length > 0) {
        secretsNote = `This app's backend expects ${missing.join(", ")} but ${missing.length > 1 ? "they aren't" : "it isn't"} configured — add ${missing.length > 1 ? "them" : "it"} in the Secrets panel or those requests will fail once deployed.`;
      }
    } else {
      // firestore.rules keeps secrets/{id} owner-only on purpose (see
      // lib/app-collaborators.ts) — a collaborator's own idToken can't read
      // them at all, and Firestore's list endpoint just silently excludes
      // every doc that fails the rule rather than throwing, so the catch
      // above would never fire and this would ship with secretsEnv = {} with
      // no sign anything was left out. Skip the doomed read and say so
      // instead of deploying an app that's silently missing env vars it
      // depends on.
      secretsNote =
        "Secrets configured on this app are only readable by its owner, so they weren't included in this deploy — ask the owner to deploy if it depends on them.";
    }

    // Written to deployStatus, not status: this used to double-write the
    // exact same `status` field a generation/refine uses ("generating" /
    // "ready" / "error"), so deploying and refining raced each other on one
    // shared field — a refine finishing after a deploy started would flip
    // status back to "ready" mid-deploy, and a refine finishing after a
    // successful deploy would silently erase its "live" badge even though
    // the app was still actually live at deployedUrl. See AppStatus's doc
    // comment in lib/types.ts and effectiveDeployStatus().
    await commit(
      [updateWrite(`apps/${appId}`, { deployStatus: "deploying", deployStartedAt: new Date() }, ["deployStatus", "deployStartedAt"])],
      idToken
    );

    try {
      const result = await deployToVercel(slug, files, undefined, secretsEnv);
      // Only starts (or restarts) the expiry clock on a deploy that's
      // claiming a slot fresh (alreadyLive: false — see the cap check
      // above): an ordinary redeploy of an app that's already live must
      // NOT reset deployExpiresAt, or the free-tier expiry (see
      // DEPLOY_EXPIRY_DAYS) could be dodged forever just by redeploying
      // before it lapses instead of going through the real renew flow.
      const expiryDays = DEPLOY_EXPIRY_DAYS[userPlan];
      const deployExpiresAt =
        !alreadyLive && expiryDays !== null ? new Date(Date.now() + expiryDays * DAY_MS) : undefined;
      await commit(
        [
          updateWrite(
            `apps/${appId}`,
            {
              deployStatus: "live",
              deployedUrl: result.url,
              deployedAt: new Date(),
              ...(deployExpiresAt ? { deployExpiresAt } : {}),
            },
            ["deployStatus", "deployedUrl", "deployedAt", ...(deployExpiresAt ? ["deployExpiresAt"] : [])]
          ),
        ],
        idToken
      );
      const note = [wrapped?.note, secretsNote].filter(Boolean).join(" ") || undefined;
      return NextResponse.json({ url: result.url, note });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deploy failed.";
      // deployErrorMessage, not errorMessage: that field is a fresh build's
      // generation-failure message (see app/api/generate/route.ts) — sharing
      // it here would let a deploy failure silently overwrite a genuinely
      // different message, or vice versa on the next refine.
      await commit(
        [updateWrite(`apps/${appId}`, { deployStatus: "error", deployErrorMessage: message }, ["deployStatus", "deployErrorMessage"])],
        idToken
      ).catch(() => {});
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to deploy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
