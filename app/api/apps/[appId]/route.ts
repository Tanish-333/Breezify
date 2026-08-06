import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/domain-api";
import { deleteApp } from "@/lib/deploy-actions";

export const runtime = "nodejs";

/**
 * Deletes an app entirely — its Vercel project domain (best-effort), its
 * secrets/versions/collaborators subcollections, and the app doc itself —
 * which immediately frees the active-subdomain slot it held, if any (see
 * MAX_ACTIVE_DEPLOYED_APPS in lib/types.ts). Routed through deleteApp() in
 * lib/deploy-actions.ts so a custom domain attached to the app's Vercel
 * project is actually detached, not just orphaned in Breezify's own records
 * while staying claimed on Vercel.
 */
export async function DELETE(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { appId } = params;
    if (!appId) return NextResponse.json({ error: "Missing app." }, { status: 400 });

    await deleteApp({ appId, uid, idToken });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't delete this app.";
    const status = message === "App not found." ? 404 : message.includes("access") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
