"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useUserApps } from "@/lib/use-apps";
import { formatDate } from "@/lib/utils";
import {
  ANALYTICS_MIN_PLAN,
  effectiveDeployStatus,
  MONTHLY_PAGE_VIEW_LIMIT,
  PLAN_RANK,
  type PlanId,
} from "@/lib/types";
import { BarChart3, Eye, Globe, Loader2, Lock } from "lucide-react";

function UpgradeGate() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="py-10 md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Analytics</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Traffic and usage across every app you&apos;ve deployed.
        </p>
      </div>
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
          <Lock className="h-7 w-7 text-muted-foreground" strokeWidth={1.25} />
          <p className="max-w-sm text-sm text-muted-foreground">
            Visit analytics are available on the Pro plan and above.
          </p>
          <Link href="/billing">
            <Button size="sm" className="mt-2">
              Upgrade to Pro
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Eye;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold leading-tight">{value}</p>
          <p className="truncate text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AnalyticsContent() {
  const { user, profile } = useAuth();
  const { apps, loading } = useUserApps(user?.uid);
  const plan: PlanId = profile?.plan ?? "free";
  const allowed = PLAN_RANK[plan] >= PLAN_RANK[ANALYTICS_MIN_PLAN];

  const liveApps = useMemo(
    () => apps.filter((a) => effectiveDeployStatus(a) === "live"),
    [apps]
  );
  const totals = useMemo(() => {
    const totalVisits = apps.reduce((sum, a) => sum + (a.visits ?? 0), 0);
    const totalMonthlyViews = apps.reduce((sum, a) => sum + (a.monthlyViews ?? 0), 0);
    return { totalVisits, totalMonthlyViews };
  }, [apps]);

  const ranked = useMemo(
    () => [...apps].sort((a, b) => (b.visits ?? 0) - (a.visits ?? 0)),
    [apps]
  );

  if (!allowed) return <UpgradeGate />;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="py-10 md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Analytics</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Traffic and usage across every app you&apos;ve deployed.
        </p>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : apps.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <BarChart3 className="h-7 w-7 text-muted-foreground" strokeWidth={1.25} />
            <p className="text-sm text-muted-foreground">
              Deploy an app to start seeing traffic here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label="Live apps" value={String(liveApps.length)} icon={Globe} />
            <StatTile
              label="Total visits"
              value={totals.totalVisits.toLocaleString()}
              icon={Eye}
            />
            <StatTile
              label="Views this month"
              value={totals.totalMonthlyViews.toLocaleString()}
              icon={BarChart3}
            />
          </div>

          <section className="mt-10">
            <h2 className="mb-4 text-base font-medium">By app</h2>
            <div className="space-y-2">
              {ranked.map((app) => {
                const status = effectiveDeployStatus(app);
                const cap = MONTHLY_PAGE_VIEW_LIMIT[plan];
                return (
                  <Card key={app.id}>
                    <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <Link href={`/build/${app.id}`} className="text-sm font-medium hover:underline">
                          {app.name}
                        </Link>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {status === "live" ? "Live" : "Not deployed"} · created{" "}
                          {formatDate(app.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-6 text-right">
                        <div>
                          <p className="text-sm font-semibold">
                            {(app.visits ?? 0).toLocaleString()}
                          </p>
                          <p className="text-[11px] text-muted-foreground">total visits</p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            {(app.monthlyViews ?? 0).toLocaleString()}
                            {cap !== null && (
                              <span className="ml-1 font-normal text-muted-foreground">
                                / {cap.toLocaleString()}
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-muted-foreground">this month</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <AnalyticsContent />
      </AppShell>
    </ProtectedRoute>
  );
}
