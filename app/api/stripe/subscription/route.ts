import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { getDoc } from "@/lib/firestore-rest";
import { getStripe, isStripeConfigured, maxDowngradeLockStatus, resolveStripeCustomerId } from "@/lib/stripe";
import { isPlanId, type PlanId } from "@/lib/types";

export const runtime = "nodejs";

// Statuses that still represent a subscription actively controlling
// access/billing, as opposed to one that's fully wound down.
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export async function POST(req: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ subscription: null });
    }

    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    let uid: string;
    let email: string | undefined;
    try {
      const verified = await verifyIdToken(idToken);
      uid = verified.uid;
      email = verified.email;
    } catch {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    const userDoc = await getDoc(`users/${uid}`, idToken);
    let customerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;
    if (!customerId) {
      customerId = await resolveStripeCustomerId(uid, email, idToken);
    }
    const plan: PlanId = isPlanId(userDoc?.fields.plan) ? (userDoc!.fields.plan as PlanId) : "free";
    const maxUpgradedAt = typeof userDoc?.fields.maxUpgradedAt === "string" ? userDoc.fields.maxUpgradedAt : undefined;
    const downgradeLock = maxDowngradeLockStatus(plan, maxUpgradedAt);

    // A Stripe customer id (cus_...) is just an identifier, not a secret —
    // safe to hand back to the account that owns it, so the billing page can
    // show plainly which Stripe customer (if any) this account maps to,
    // instead of leaving that invisible until something breaks.
    if (!customerId) {
      return NextResponse.json({ subscription: null, customerId: null, downgradeLockedUntil: downgradeLock.until });
    }

    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const active = subs.data.find((s) => LIVE_STATUSES.has(s.status));
    if (!active) {
      return NextResponse.json({ subscription: null, customerId, downgradeLockedUntil: downgradeLock.until });
    }

    return NextResponse.json({
      subscription: {
        status: active.status,
        cancelAtPeriodEnd: active.cancel_at_period_end,
        // Moved to the subscription's first item in recent API versions —
        // see the matching comment in cancel-subscription/route.ts.
        currentPeriodEnd: active.items.data[0]?.current_period_end,
      },
      customerId,
      downgradeLockedUntil: downgradeLock.until,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load subscription status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
