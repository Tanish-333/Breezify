import { NextRequest, NextResponse } from "next/server";
import { commit, updateWrite } from "@/lib/firestore-rest";
import { authenticate, requirePlan, loadDeployedApp } from "@/lib/domain-api";

export const runtime = "nodejs";

/**
 * Toggles whether app/api/cron/renew-domains should try to renew this app's
 * purchased domain before it expires. Only meaningful for a domain actually
 * bought through Breezify (domainPurchased) — a bring-your-own domain isn't
 * Breezify's to renew, so there's nothing here to turn on for one.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const planError = await requirePlan(uid, idToken);
    if (planError) return planError;

    const { appId, autoRenew } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }
    if (typeof autoRenew !== "boolean") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const loaded = await loadDeployedApp(appId, uid, idToken);
    if (loaded.error) return loaded.error;
    if (!loaded.doc.fields.domainPurchased) {
      return NextResponse.json(
        { error: "Auto-renew only applies to a domain bought through Breezify." },
        { status: 400 }
      );
    }

    await commit(
      [updateWrite(`apps/${appId}`, { domainAutoRenew: autoRenew }, ["domainAutoRenew"])],
      idToken
    );

    return NextResponse.json({ domainAutoRenew: autoRenew });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't update auto-renew.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
