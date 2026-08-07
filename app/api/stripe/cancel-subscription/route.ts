import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { getDoc } from "@/lib/firestore-rest";
import { getStripe, isStripeConfigured, maxDowngradeLockStatus, resolveStripeCustomerId } from "@/lib/stripe";
import { formatDate } from "@/lib/utils";
import { isPlanId, type PlanId } from "@/lib/types";

export const runtime = "nodejs";

const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

/**
 * Toggles cancel_at_period_end on the caller's own subscription: cancel:true
 * turns auto-renew off (access continues until the period ends, then
 * customer.subscription.deleted drops them to free), cancel:false turns it
 * back on. The subscription is always looked up server-side from the
 * caller's own stripeCustomerId, never taken from the request, so there's
 * no way to target anyone else's subscription.
 */
export async function POST(req: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: "Payments aren't configured on this deployment yet." },
        { status: 400 }
      );
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

    const { cancel } = await req.json();
    if (typeof cancel !== "boolean") {
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    }

    const userDoc = await getDoc(`users/${uid}`, idToken);

    // Canceling (turning auto-renew off) eventually drops a Max subscriber
    // to free once the period ends — the same outcome as downgrading
    // through the portal, so it has to respect the same 30-day lock or a
    // Max subscriber could just cancel instead to route around it. Turning
    // auto-renew back ON is never blocked, in either direction.
    if (cancel) {
      const plan: PlanId = isPlanId(userDoc?.fields.plan) ? (userDoc!.fields.plan as PlanId) : "free";
      const maxUpgradedAt = typeof userDoc?.fields.maxUpgradedAt === "string" ? userDoc.fields.maxUpgradedAt : undefined;
      const { locked, until } = maxDowngradeLockStatus(plan, maxUpgradedAt);
      if (locked && until) {
        return NextResponse.json(
          { error: `Max plans can't be canceled or downgraded until ${formatDate(until)}, 30 days after upgrading.` },
          { status: 403 }
        );
      }
    }
    let customerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;
    if (!customerId) {
      customerId = await resolveStripeCustomerId(uid, email, idToken);
    }
    if (!customerId) {
      const plan = typeof userDoc?.fields.plan === "string" ? (userDoc.fields.plan as string) : "free";
      return NextResponse.json(
        {
          error:
            plan === "free"
              ? "No billing account found yet. Subscribe to a plan first."
              : "Your plan wasn't set up through Stripe, so there's no subscription to change here. Contact support if you need to change or cancel it.",
        },
        { status: 400 }
      );
    }

    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const liveSubs = subs.data.filter((s) => LIVE_STATUSES.has(s.status));
    if (liveSubs.length === 0) {
      return NextResponse.json({ error: "No active subscription found." }, { status: 404 });
    }

    // Normally there's exactly one. If a customer somehow ended up with more
    // than one live subscription (e.g. from before duplicate checkouts were
    // blocked), toggling auto-renew applies to all of them, not just
    // whichever happens to be listed first, so "cancel" actually stops every
    // charge rather than leaving a second one silently still renewing.
    const updates = await Promise.all(
      liveSubs.map((s) => stripe.subscriptions.update(s.id, { cancel_at_period_end: cancel }))
    );
    const updated = updates[0];

    return NextResponse.json({
      subscription: {
        status: updated.status,
        cancelAtPeriodEnd: updated.cancel_at_period_end,
        // Moved off the subscription object itself to its first item in
        // recent API versions (a subscription can have items on different
        // billing cycles now) — see the Subscription/SubscriptionItem type
        // definitions in the installed stripe package for the current shape.
        currentPeriodEnd: updated.items.data[0]?.current_period_end,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update your subscription.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
