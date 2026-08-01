"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/pricing-table";
import { auth } from "@/lib/firebase";
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
import { AlertCircle, Check, CheckCircle2, Loader2, Receipt, TrendingDown } from "lucide-react";

function BillingContent() {
  const { user, profile } = useAuth();
  const { transactions, loading } = useTransactions(user?.uid);
  const searchParams = useSearchParams();
  const plan: PlanId = profile?.plan ?? "free";

  const [checkoutPlan, setCheckoutPlan] = useState<PlanId | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const checkoutResult = searchParams.get("checkout");

  const creditsUsed = transactions.reduce((sum, t) => sum + (t.creditsUsed ?? 0), 0);

  async function authedFetch(path: string, body?: unknown) {
    const idToken = await auth.currentUser?.getIdToken();
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  }

  async function startCheckout(targetPlan: PlanId) {
    setBillingError("");
    setCheckoutPlan(targetPlan);
    try {
      const { url } = await authedFetch("/api/create-checkout-session", { plan: targetPlan });
      window.location.href = url;
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Couldn't start checkout.");
      setCheckoutPlan(null);
    }
  }

  async function openPortal() {
    setBillingError("");
    setPortalLoading(true);
    try {
      const { url } = await authedFetch("/api/stripe/portal");
      window.location.href = url;
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Couldn't open the billing portal.");
      setPortalLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your plan, credits, and usage history.
        </p>
      </div>

      {checkoutResult === "success" && (
        <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Payment complete. Your plan updates as soon as Stripe confirms it, usually within seconds.</span>
        </div>
      )}
      {billingError && (
        <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{billingError}</span>
        </div>
      )}

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
          <CardContent className="flex flex-col justify-center gap-2 p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Credits spent
            </p>
            <p className="text-3xl font-semibold tracking-tight">{creditsUsed.toFixed(2)}</p>
            {plan !== "free" && (
              <Button size="sm" variant="secondary" onClick={openPortal} loading={portalLoading}>
                Manage billing
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium">Plans</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_IDS.map((id) => {
            const p = PLANS[id];
            const isCurrent = id === plan;
            const isUpgrade = PLAN_RANK[id] > PLAN_RANK[plan];
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
                  {isCurrent ? (
                    <Button className="mt-5 w-full" size="sm" variant="ghost" disabled>
                      Current plan
                    </Button>
                  ) : isUpgrade ? (
                    <Button
                      className="mt-5 w-full"
                      size="sm"
                      onClick={() => startCheckout(id)}
                      loading={checkoutPlan === id}
                      disabled={checkoutPlan !== null}
                    >
                      {id === "free" ? "Start free" : "Upgrade"}
                    </Button>
                  ) : (
                    <Button
                      className="mt-5 w-full"
                      size="sm"
                      variant="ghost"
                      onClick={openPortal}
                      loading={portalLoading}
                    >
                      Downgrade
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium">Compare every plan</h2>
        <PricingTable />
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
