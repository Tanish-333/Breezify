import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, getDoc, updateWrite } from "@/lib/firestore-rest";
import { getStripe, isStripeConfigured, priceIdFor } from "@/lib/stripe";
import { PLAN_RANK, isPlanId, type PlanId } from "@/lib/types";

export const runtime = "nodejs";

function appUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
}

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

    const { plan } = await req.json();
    if (!isPlanId(plan) || plan === "free" || PLAN_RANK[plan] < PLAN_RANK.plus) {
      return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
    }

    const priceId = priceIdFor(plan as PlanId);
    if (!priceId) {
      return NextResponse.json(
        { error: `No Stripe price configured for the ${plan} plan.` },
        { status: 400 }
      );
    }

    const userPath = `users/${uid}`;
    const userDoc = await getDoc(userPath, idToken);
    const existingCustomerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;

    const stripe = getStripe();

    // Without this, two tabs (or a slow first checkout retried before the
    // client-side "loading" state updates) can each create their own
    // Checkout Session, ending in two live subscriptions for the same
    // customer — Stripe bills both, and /api/stripe/subscription and
    // /api/stripe/cancel-subscription only ever look at the first one they
    // find, so the second keeps renewing with no way to discover or cancel
    // it through the app. Existing subscribers manage plan changes through
    // the billing portal instead, which operates on the one subscription
    // that already exists rather than layering a new one on top.
    if (existingCustomerId) {
      const existingSubs = await stripe.subscriptions.list({
        customer: existingCustomerId,
        status: "all",
        limit: 100,
      });
      const stillLive = existingSubs.data.some(
        (s) => s.status !== "canceled" && s.status !== "incomplete_expired"
      );
      if (stillLive) {
        return NextResponse.json(
          {
            error:
              "You already have an active subscription. Use \"Manage billing\" to change or cancel your plan.",
          },
          { status: 409 }
        );
      }
    }

    const returnUrl = `${appUrl(req)}/billing`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: uid,
      customer: existingCustomerId,
      customer_email: existingCustomerId ? undefined : email,
      allow_promotion_codes: true,
      metadata: { uid, plan },
      subscription_data: { metadata: { uid, plan } },
      success_url: `${returnUrl}?checkout=success`,
      cancel_url: `${returnUrl}?checkout=canceled`,
    });

    // Not security-sensitive (only touches this user's own doc, with their
    // own token), just convenient: saves the customer ID for next time so
    // repeat checkouts and the billing portal don't need to look it up again.
    if (session.customer && !existingCustomerId) {
      await commit(
        [updateWrite(userPath, { stripeCustomerId: session.customer as string }, ["stripeCustomerId"])],
        idToken
      ).catch(() => {});
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
