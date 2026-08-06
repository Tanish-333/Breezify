import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/domain-api";
import { commit, getDoc, updateWrite } from "@/lib/firestore-rest";
import { canRenewDeploy, DEPLOY_EXPIRY_DAYS, PLANS, type PlanId } from "@/lib/types";

export const runtime = "nodejs";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Renews a deployed app's free-tier expiry clock (DEPLOY_EXPIRY_DAYS in
 * lib/types.ts), only accepted inside the renewal window: within
 * RENEWAL_WINDOW_DAYS of deployExpiresAt, or any time after it's already
 * passed. Renewing resets the clock RENEWAL window days from right now, not
 * from the old expiresAt — a renewal two weeks late still buys a fresh full
 * period starting today, not a backdated one.
 */
export async function POST(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { appId } = params;
    if (!appId) return NextResponse.json({ error: "Missing app." }, { status: 400 });

    const appDoc = await getDoc(`apps/${appId}`, idToken);
    if (!appDoc) return NextResponse.json({ error: "App not found." }, { status: 404 });
    if (appDoc.fields.userId !== uid) {
      return NextResponse.json({ error: "You don't have access to this app." }, { status: 403 });
    }

    const userDoc = await getDoc(`users/${uid}`, idToken);
    const plan = (userDoc?.fields.plan as PlanId) ?? "free";
    const expiryDays = DEPLOY_EXPIRY_DAYS[plan];
    if (expiryDays === null) {
      return NextResponse.json(
        { error: `Apps on the ${PLANS[plan].name} plan don't expire — there's nothing to renew.` },
        { status: 400 }
      );
    }

    const deployExpiresAt = appDoc.fields.deployExpiresAt as string | undefined;
    const expiresAtMs = deployExpiresAt ? Date.parse(deployExpiresAt) : undefined;
    if (!expiresAtMs || !canRenewDeploy(expiresAtMs)) {
      const daysLeft = expiresAtMs ? Math.ceil((expiresAtMs - Date.now()) / DAY_MS) : null;
      return NextResponse.json(
        {
          error:
            daysLeft && daysLeft > 0
              ? `This app isn't due for renewal yet — you can renew starting 2 days before it expires (in ${daysLeft} day${daysLeft === 1 ? "" : "s"}), or any time after.`
              : "This app has no active deploy to renew. Deploy it first.",
        },
        { status: 400 }
      );
    }

    const newExpiresAt = new Date(Date.now() + expiryDays * DAY_MS);
    await commit(
      [updateWrite(`apps/${appId}`, { deployExpiresAt: newExpiresAt }, ["deployExpiresAt"])],
      idToken
    );

    return NextResponse.json({ deployExpiresAt: newExpiresAt.getTime() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't renew this app.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
