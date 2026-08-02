import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { getDoc } from "@/lib/firestore-rest";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

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
    try {
      uid = (await verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    const userDoc = await getDoc(`users/${uid}`, idToken);
    const customerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;
    if (!customerId) {
      return NextResponse.json({ subscription: null });
    }

    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const active = subs.data.find((s) => LIVE_STATUSES.has(s.status));
    if (!active) {
      return NextResponse.json({ subscription: null });
    }

    return NextResponse.json({
      subscription: {
        status: active.status,
        cancelAtPeriodEnd: active.cancel_at_period_end,
        currentPeriodEnd: active.current_period_end,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load subscription status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
