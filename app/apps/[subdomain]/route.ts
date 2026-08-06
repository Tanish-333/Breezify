import { NextRequest, NextResponse } from "next/server";
import { getTenantApp } from "@/lib/tenant-app";
import { checkAndRecordView } from "@/lib/traffic-guard";
import { buildPreview } from "@/lib/preview";
import { isFirebaseAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://breezify.vercel.app";
}

function htmlResponse(doc: string, status = 200) {
  return new NextResponse(doc, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function simplePage(title: string, message: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head><body style="font:15px/1.6 ui-sans-serif,system-ui,sans-serif;max-width:480px;margin:80px auto;padding:0 20px;color:#18181b"><h1 style="font-size:20px">${title}</h1><p style="color:#71717a">${message}</p></body></html>`;
}

/**
 * Serves a free-tier deployed app at `{subdomain}.DEPLOY_DOMAIN` (see
 * middleware.ts, which rewrites the incoming host to this route) or, before
 * DEPLOY_DOMAIN is set, directly at /apps/{subdomain} on the main app's own
 * origin. This is what makes free-tier hosting cost zero Vercel projects —
 * see the long comment on deployFreeTierApp() in lib/deploy-actions.ts for
 * why that matters.
 *
 * Renders with the exact same lib/preview.ts buildPreview() the dashboard's
 * live preview already uses — recomputed on each request rather than
 * stored, since it's cheap pure string work (the actual JSX/TS
 * transpilation happens in the VISITOR's browser via Babel standalone, not
 * here), and recomputing it means it can never go stale against the app's
 * real generatedCode.files the way a persisted copy could after a refine.
 * The lookup itself is still cached (see lib/tenant-app.ts) so a busy app
 * doesn't mean a Firestore read on every request.
 */
export async function GET(req: NextRequest, { params }: { params: { subdomain: string } }) {
  if (!isFirebaseAdminConfigured()) {
    return htmlResponse(
      simplePage(
        "Hosting not configured",
        "This deployment doesn't have FIREBASE_SERVICE_ACCOUNT set, which free-tier subdomain hosting needs to look apps up. See .env.example."
      ),
      503
    );
  }

  const tenant = await getTenantApp(params.subdomain);
  if (!tenant) {
    return htmlResponse(simplePage("Not found", "No app is live at this address."), 404);
  }

  const { blocked, reason } = await checkAndRecordView(tenant.appId);
  if (blocked) {
    const url = new URL("/limit-reached", appUrl());
    url.searchParams.set("app", tenant.appId);
    url.searchParams.set("reason", reason ?? "traffic");
    return NextResponse.redirect(url);
  }

  const preview = buildPreview(tenant.files, appUrl(), true);
  if (preview.kind === "unsupported") {
    return htmlResponse(simplePage("Can't run this app", preview.reason));
  }
  return htmlResponse(preview.doc);
}
