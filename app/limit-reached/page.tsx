import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, Gauge } from "lucide-react";

export const metadata = {
  title: "Breezify",
  robots: { index: false, follow: false },
};

/**
 * Visitors land here when a deployed app is blocked — either it's over its
 * owner's plan traffic cap (MONTHLY_PAGE_VIEW_LIMIT) or its free-tier
 * subdomain has expired unrenewed (DEPLOY_EXPIRY_DAYS), both in
 * lib/types.ts. The tracking beacon injected into every deployed app
 * (lib/analytics-snippet.ts) redirects here client-side once /api/track
 * reports the app as blocked, carrying which reason in `?reason=`. Lives on
 * the main app's own domain, not the deployed app's subdomain, so it always
 * renders regardless of which tenant sent the visitor here.
 */
export default function LimitReachedPage({
  searchParams,
}: {
  searchParams: { reason?: string };
}) {
  const expired = searchParams.reason === "expired";

  return (
    <div>
      <SiteHeader />
      <div className="container flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border">
          {expired ? (
            <Clock className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Gauge className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {expired ? "This link has expired" : "Traffic limit reached"}
        </p>
        <h1 className="max-w-lg text-3xl font-semibold tracking-tight md:text-4xl">
          {expired ? "This app's link is no longer active" : "This app has hit its plan's traffic limit"}
        </h1>
        <p className="max-w-md text-muted-foreground">
          {expired
            ? "Free apps on Breezify stay live for 30 days and need a quick renewal to keep going. The owner can renew it from their Breezify dashboard, or upgrade for a subdomain that never expires."
            : "This app has used up its owner's monthly visitor allowance. It'll be back once the limit resets, or the owner can upgrade Breezify for a much higher limit — right away."}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          <Link href="/billing">
            <Button>
              Upgrade Breezify plan
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">Back to Breezify</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
