import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/domain-api";
import { undeployApp } from "@/lib/deploy-actions";

export const runtime = "nodejs";

/**
 * Takes an app offline (a paid-plan deploy's underlying Vercel project is
 * actually deleted, not just forgotten about — see undeployApp's own doc
 * comment for why) and frees the active-subdomain slot it held (see
 * MAX_ACTIVE_DEPLOYED_APPS in lib/types.ts) so a new app can be deployed in
 * its place. The app itself, its generated code, and its history are
 * untouched — it can be redeployed any time, subject to the cap again at
 * that point.
 */
export async function POST(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { appId } = params;
    if (!appId) return NextResponse.json({ error: "Missing app." }, { status: 400 });

    await undeployApp({ appId, uid, idToken });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't undeploy this app.";
    const status = message === "App not found." ? 404 : message.includes("access") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
