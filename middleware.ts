import { NextRequest, NextResponse } from "next/server";

/**
 * Routes free-tier deployed apps to app/apps/[subdomain]/route.ts by
 * hostname. Entirely a no-op until DEPLOY_DOMAIN is set (see
 * .env.example) — safe to ship ahead of the domain purchase, since nothing
 * changes for any existing route until then.
 *
 * Deliberately doesn't touch paid-plan apps: those are aliased directly to
 * their own real Vercel project by Vercel itself (see
 * lib/vercel-deploy.ts's tryCustomAlias and app/api/deploy/route.ts) once
 * `*.DEPLOY_DOMAIN` is added as a wildcard domain on this project in
 * Vercel — a specific subdomain alias there takes priority at Vercel's own
 * edge, so a paid app's traffic never reaches this middleware at all. This
 * only ever runs for hostnames Vercel is routing to THIS project, which
 * after that wildcard is added means every subdomain that ISN'T
 * individually aliased elsewhere — i.e. exactly the free-tier ones.
 */
const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "mail", "ftp"]);

export function middleware(req: NextRequest) {
  const deployDomain = process.env.DEPLOY_DOMAIN?.toLowerCase();
  if (!deployDomain) return NextResponse.next();

  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  if (host === deployDomain || host === `www.${deployDomain}`) return NextResponse.next();
  if (!host.endsWith(`.${deployDomain}`)) return NextResponse.next();

  const subdomain = host.slice(0, -(`.${deployDomain}`.length));
  if (!subdomain || subdomain.includes(".") || RESERVED_SUBDOMAINS.has(subdomain)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = `/apps/${subdomain}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skips Next's own internals, the /api surface (shared infra, never
  // tenant-specific), and any request for a literal file (favicons, the
  // manifest, etc.) — those resolve the same regardless of host.
  matcher: ["/((?!_next/static|_next/image|favicon|api|.*\\..*).*)"],
};
