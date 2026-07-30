"use client";

import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { useTransactions } from "@/lib/use-transactions";
import { formatCredits, formatDate, cn } from "@/lib/utils";
import {
  MODEL_INFO,
  PLANS,
  PLAN_IDS,
  PLAN_RANK,
  type PlanId,
} from "@/lib/types";
import { Check, Loader2, Receipt, TrendingDown } from "lucide-react";

function BillingContent() {
  const { user, profile } = useAuth();
  const { transactions, loading } = useTransactions(user?.uid);
  const plan: PlanId = profile?.plan ?? "free";

  const creditsUsed = transactions.reduce((sum, t) => sum + (t.creditsUsed ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your plan, credits, and usage history.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Credit balance
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {profile ? formatCredits(profile.credits) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Current plan</p>
            <p className="mt-2 text-3xl font-semibold capitalize tracking-tight">
              {PLANS[plan]?.name ?? "Free"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Credits spent
            </p>
            <p className="mt-2 text-3xl font-semibold tracking-tight">
              {creditsUsed.toFixed(2)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium">Plans</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_IDS.map((id) => {
            const p = PLANS[id];
            const isCurrent = id === plan;
            const isDowngrade = PLAN_RANK[id] < PLAN_RANK[plan];
            return (
              <Card
                key={id}
                className={cn(
                  "flex flex-col",
                  isCurrent && "border-foreground ring-1 ring-foreground"
                )}
              >
                <CardContent className="flex h-full flex-col p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{p.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-2xl font-semibold tracking-tight">{p.price}</span>
                    <span className="text-xs text-muted-foreground">/ {p.period}</span>
                  </div>
                  <ul className="mt-4 flex-1 space-y-2 text-xs">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-1.5">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="mt-5 w-full"
                    size="sm"
                    variant={isCurrent ? "ghost" : isDowngrade ? "ghost" : "primary"}
                    disabled
                    title="Payments aren't connected yet"
                  >
                    {isCurrent ? "Current plan" : isDowngrade ? "Downgrade" : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Checkout isn&apos;t connected yet, so plan changes are disabled. Your plan is read from
          your account and already controls which models you can use.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage history</CardTitle>
          <CardDescription>Your most recent generations and credit changes.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Receipt className="h-6 w-6 text-muted-foreground" strokeWidth={1.25} />
              <p className="text-sm text-muted-foreground">
                No usage yet. Generate your first app to see it here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {t.model ? MODEL_INFO[t.model]?.label ?? t.model : "Credit change"}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDate(t.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-sm tabular-nums">
                    {t.creditsUsed != null ? (
                      <>
                        <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>-{t.creditsUsed.toFixed(2)}</span>
                      </>
                    ) : (
                      <span className="text-success">+{(t.creditsAdded ?? 0).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BillingPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <BillingContent />
      </AppShell>
    </ProtectedRoute>
  );
}
