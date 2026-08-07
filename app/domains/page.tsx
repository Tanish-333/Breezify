"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CustomDomainDialog } from "@/components/custom-domain-dialog";
import { useAuth } from "@/lib/auth-context";
import { useUserApps } from "@/lib/use-apps";
import { formatDate } from "@/lib/utils";
import { CUSTOM_DOMAIN_MIN_PLAN, PLAN_RANK, PLANS, type FeatherApp, type PlanId } from "@/lib/types";
import { CheckCircle2, Clock, Globe, Loader2, Lock, RefreshCw, Sparkles } from "lucide-react";

function UpgradeGate() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="py-10 md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Domains</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Point your own domain at a deployed app, or buy a new one through Breezify.
        </p>
      </div>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <Lock className="h-7 w-7 text-muted-foreground" strokeWidth={1.25} />
          <p className="max-w-sm text-sm text-muted-foreground">
            Custom domains are available on the {PLANS[CUSTOM_DOMAIN_MIN_PLAN].name} plan and above.
          </p>
          <Link href="/billing">
            <Button size="sm" className="mt-2">
              Upgrade to {PLANS[CUSTOM_DOMAIN_MIN_PLAN].name}
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function hostnameOf(url?: string) {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function DeployedRow({ app, onManage }: { app: FeatherApp; onManage: () => void }) {
  const fallbackHost = hostnameOf(app.deployedUrl);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href={`/build/${app.id}`} className="text-sm font-medium hover:underline">
            {app.name}
          </Link>
          {app.customDomain ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {app.customDomainVerified ? (
                <a
                  href={`https://${app.customDomain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-mono text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {app.customDomain}
                </a>
              ) : (
                <span className="truncate font-mono text-xs text-muted-foreground">{app.customDomain}</span>
              )}
              {app.customDomainVerified ? (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  Live
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Needs DNS setup
                </span>
              )}
              {app.domainPurchased && (
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  · {app.domainAutoRenew ? "renews" : "expires"}
                  {app.domainExpiresAt ? ` ${formatDate(app.domainExpiresAt)}` : ""}
                  {!app.domainAutoRenew && " (auto-renew off)"}
                </span>
              )}
            </div>
          ) : fallbackHost ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              No custom domain — live at{" "}
              <a href={app.deployedUrl} target="_blank" rel="noreferrer" className="hover:text-foreground hover:underline">
                {fallbackHost}
              </a>
            </p>
          ) : (
            <p className="mt-1 truncate text-xs text-muted-foreground">No custom domain</p>
          )}
        </div>
        <Button variant="secondary" size="sm" className="shrink-0" onClick={onManage}>
          <Globe className="h-3.5 w-3.5" />
          {app.customDomain ? "Manage" : "Add domain"}
        </Button>
      </CardContent>
    </Card>
  );
}

function NotDeployedRow({ app }: { app: FeatherApp }) {
  // A free-tier app deploys to a shared *.breezify subdomain (app.subdomain),
  // never to its own real Vercel project (app.deployedUrl) — a custom domain
  // attaches to that real project, so this is genuinely a different reason
  // than "hasn't been deployed at all" and deserves its own copy.
  const onFreeTierSubdomain = Boolean(app.subdomain);
  return (
    <Card className="opacity-60">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <Link href={`/build/${app.id}`} className="text-sm font-medium hover:underline">
            {app.name}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {onFreeTierSubdomain
              ? "Live on a free shared subdomain — needs a paid-plan deploy to attach a custom domain"
              : "Not deployed yet"}
          </p>
        </div>
        <Link href={`/build/${app.id}`} className="shrink-0">
          <Button variant="ghost" size="sm">
            {onFreeTierSubdomain ? "Open app" : "Deploy first"}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function DomainsContent() {
  const { user, profile } = useAuth();
  const { apps, loading } = useUserApps(user?.uid);
  const plan: PlanId = profile?.plan ?? "free";
  const allowed = PLAN_RANK[plan] >= PLAN_RANK[CUSTOM_DOMAIN_MIN_PLAN];
  const [managingId, setManagingId] = useState<string | null>(null);

  const { deployed, notDeployed } = useMemo(() => {
    const deployed = apps.filter((a) => Boolean(a.deployedUrl));
    const notDeployed = apps.filter((a) => !a.deployedUrl);
    return { deployed, notDeployed };
  }, [apps]);

  if (!allowed) return <UpgradeGate />;

  const managingApp = apps.find((a) => a.id === managingId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="py-10 md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Domains</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Point your own domain at a deployed app, or buy a new one through Breezify — manage every app&apos;s
          domain from one place.
        </p>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : deployed.length === 0 && notDeployed.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Sparkles className="h-7 w-7 text-muted-foreground" strokeWidth={1.25} />
            <p className="text-sm text-muted-foreground">Build and deploy an app to attach a domain here.</p>
            <Link href="/build">
              <Button size="sm" className="mt-2">
                New app
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {deployed.length > 0 && (
            <section>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Deployed apps
              </h2>
              <div className="space-y-2">
                {deployed.map((app) => (
                  <DeployedRow key={app.id} app={app} onManage={() => setManagingId(app.id)} />
                ))}
              </div>
            </section>
          )}

          {notDeployed.length > 0 && (
            <section className="mt-8">
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Not deployed yet
              </h2>
              <div className="space-y-2">
                {notDeployed.map((app) => (
                  <NotDeployedRow key={app.id} app={app} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <p className="mt-10 flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="h-3 w-3" />A domain bought through Breezify renews automatically unless you turn
        that off — turning it off lets the registration lapse on its expiry date instead of being charged again.
      </p>

      {managingApp && (
        <CustomDomainDialog
          appId={managingApp.id}
          currentDomain={managingApp.customDomain}
          domainPurchased={managingApp.domainPurchased}
          domainExpiresAt={managingApp.domainExpiresAt}
          domainAutoRenew={managingApp.domainAutoRenew}
          onClose={() => setManagingId(null)}
        />
      )}
    </div>
  );
}

export default function DomainsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <DomainsContent />
      </AppShell>
    </ProtectedRoute>
  );
}
