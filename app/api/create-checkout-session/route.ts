import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, updateWrite } from "@/lib/firestore-rest";
import { getOrCreateUserDoc } from "@/lib/ensure-user-doc-server";
import { getStripe, isStripeConfigured, priceIdFor, resolveStripeCustomerId } from "@/lib/stripe";
import { PLAN_RANK, isPlanId, type PlanId } from "@/lib/types";
import { getAppBaseUrl } from "@/lib/app-base-url";

export const runtime = "nodejs";

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
    // Self-heals the same race lib/auth-context.tsx's client-side profile
    // creation can hit (see lib/ensure-user-doc-server.ts): without this, a
    // signed-in, paying customer whose users/{uid} doc never landed could
    // check out fine, but the Stripe webhook's isKnownBreezifyUser(uid)
    // check would find no profile to grant the plan onto — a real charge
    // with the plan silently never applied, and Stripe support pointing
    // back at an app that insists no such customer exists.
    const userDoc = await getOrCreateUserDoc(uid, idToken, email, req.headers);
    if (!userDoc) {
      return NextResponse.json(
        { error: "We couldn't find or set up your account. Please sign out and back in, then try again." },
        { status: 400 }
      );
    }
    let existingCustomerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;
    // Without this, a missing stripeCustomerId (the exact gap the self-heal
    // above and lib/stripe.ts's own doc comment describe) fell straight
    // through to `customer_email` below — which makes Stripe Checkout
    // create a BRAND NEW customer even when a real one already exists for
    // that email (e.g. from an earlier canceled subscription, or a domain
    // purchase). That's how one person ends up with several Stripe
    // customer records, each with its own subscriptions the app never
    // looks at together — the exact "can't identify the customer" failure
    // mode this route otherwise works hard to avoid.
    if (!existingCustomerId) {
      existingCustomerId = await resolveStripeCustomerId(uid, email, idToken);
    }

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

    const returnUrl = `${getAppBaseUrl(req.nextUrl.origin)}/billing`;

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
      // Not fatal if this fails — app/api/stripe/webhook's setPlan() backfills
      // the same field via the Admin SDK once the checkout completes, as a
      // reliable backstop for exactly this failing. Logged rather than fully
      // swallowed so a real failure here is at least visible somewhere.
      await commit(
        [updateWrite(userPath, { stripeCustomerId: session.customer as string }, ["stripeCustomerId"])],
        idToken
      ).catch((err) => {
        console.error(`[create-checkout-session] uid=${uid} failed to save stripeCustomerId client-side:`, err);
      });
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start checkout.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
