import { NextResponse } from "next/server";
import { getDeployDomain } from "@/lib/deploy-domain";

export const runtime = "nodejs";

/**
 * Exposes DEPLOY_DOMAIN to the client. DEPLOY_DOMAIN is server-only (read
 * directly from process.env, no NEXT_PUBLIC_ prefix — see its own doc
 * comment in lib/deploy-domain.ts), so app/settings/page.tsx can't read it
 * by importing process.env directly: Next.js only inlines NEXT_PUBLIC_*
 * vars into the client bundle, and this one deliberately isn't one (every
 * other reader of it — middleware.ts, lib/vercel-deploy.ts,
 * lib/deploy-actions.ts — is server-side). Not sensitive (it's just a
 * hostname, the same one every visitor to a deployed app already sees), so
 * a plain unauthenticated GET is fine.
 */
export async function GET() {
  return NextResponse.json({ domain: getDeployDomain() ?? null });
}
