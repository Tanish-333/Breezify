import { NextRequest, NextResponse } from "next/server";
import { commit, createWrite, getDoc } from "@/lib/firestore-rest";
import { authenticate, requirePlan, loadDeployedApp, DOMAIN_RE } from "@/lib/domain-api";
import { checkDomainAvailability, getDomainPrice, isDeployConfigured, type DomainContact } from "@/lib/vercel-deploy";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { markedUpDomainPrice } from "@/lib/types";
import { getAppBaseUrl } from "@/lib/app-base-url";

export const runtime = "nodejs";

const CONTACT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "address1",
  "city",
  "state",
  "zip",
  "country",
] as const;

/**
 * Starts a domain purchase: re-validates availability/price server-side
 * (never trusts the client's number), opens a one-time Stripe Checkout for
 * Breezify's marked-up price, and records a pending order the webhook picks
 * up once payment actually lands (see app/api/stripe/webhook — the domain is
 * only bought from Vercel, and charged for, after Stripe confirms the
 * charge, not here).
 */
export async function POST(req: NextRequest) {
  try {
    if (!isDeployConfigured() || !isStripeConfigured()) {
      return NextResponse.json(
        { error: "Domain purchases aren't configured on this deployment yet." },
        { status: 400 }
      );
    }

    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const planError = await requirePlan(uid, idToken);
    if (planError) return planError;

    const body = await req.json();
    const appId = typeof body.appId === "string" ? body.appId : "";
    const domain = typeof body.domain === "string" ? body.domain.trim().toLowerCase() : "";
    const rawContact = (body.contact ?? {}) as Record<string, unknown>;
    // Defaults on: a lapsed domain is a worse outcome than an easily-toggled
    // renewal charge next year — see app/api/domains/auto-renew for turning
    // it off, and app/api/cron/renew-domains for what actually renews it.
    const autoRenew = body.autoRenew !== false;

    if (!appId) return NextResponse.json({ error: "Missing app." }, { status: 400 });
    if (!DOMAIN_RE.test(domain)) {
      return NextResponse.json({ error: "Enter a valid domain, e.g. myapp.com." }, { status: 400 });
    }
    for (const field of CONTACT_FIELDS) {
      if (typeof rawContact[field] !== "string" || !(rawContact[field] as string).trim()) {
        return NextResponse.json({ error: "Fill in every registrant contact field." }, { status: 400 });
      }
    }
    const country = (rawContact.country as string).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
      return NextResponse.json({ error: "Country must be a 2-letter code, e.g. US." }, { status: 400 });
    }

    const loaded = await loadDeployedApp(appId, uid, idToken);
    if (loaded.error) return loaded.error;

    const available = await checkDomainAvailability(domain);
    if (!available) {
      return NextResponse.json({ error: "That domain isn't available anymore." }, { status: 409 });
    }
    const { purchasePrice, years } = await getDomainPrice(domain, 1);
    const chargePrice = markedUpDomainPrice(purchasePrice);

    const contact: DomainContact = {
      firstName: (rawContact.firstName as string).trim(),
      lastName: (rawContact.lastName as string).trim(),
      email: (rawContact.email as string).trim(),
      phone: (rawContact.phone as string).trim(),
      address1: (rawContact.address1 as string).trim(),
      address2: typeof rawContact.address2 === "string" ? rawContact.address2.trim() : undefined,
      city: (rawContact.city as string).trim(),
      state: (rawContact.state as string).trim(),
      zip: (rawContact.zip as string).trim(),
      country,
      companyName: typeof rawContact.companyName === "string" ? rawContact.companyName.trim() : undefined,
    };

    // Reused across every purchase this uid ever makes (subscriptions,
    // other domains) — see create-checkout-session/route.ts, which stamps
    // this the same way after its own checkout.
    const userDoc = await getDoc(`users/${uid}`, idToken);
    const existingCustomerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;

    const stripe = getStripe();
    const returnUrl = `${getAppBaseUrl(req.nextUrl.origin)}/build/${appId}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // The account has Managed Payments (Stripe-as-merchant-of-record) on
      // by default, which requires every line item's product to carry a
      // Stripe Tax product tax_code — this ad-hoc, dynamically-priced
      // domain-resale item never had one, so every purchase 400'd before a
      // customer could even see the checkout page. Opting this one-off
      // session out of Managed Payments is Stripe's own documented fix and
      // matches how the subscription checkout (create-checkout-session)
      // already behaves without needing a tax code at all.
      managed_payments: { enabled: false },
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(chargePrice * 100),
            product_data: {
              name: `Domain registration: ${domain}`,
              description: `${years}-year registration, attached to your Breezify app once paid.`,
            },
          },
          quantity: 1,
        },
      ],
      client_reference_id: uid,
      customer: existingCustomerId,
      // "payment" mode doesn't create a persistent Customer object on its
      // own the way "subscription" mode always does — without one of these
      // two, there'd be nothing to attach a saved card to for next year's
      // renewal charge.
      customer_creation: existingCustomerId ? undefined : "always",
      // Attaches the card used here to the Customer for later off-session
      // use — this is what makes an unattended renewal charge possible at
      // all next year. See app/api/stripe/webhook's handleDomainPurchase,
      // which sets it as the customer's default payment method once this
      // checkout completes.
      payment_intent_data: autoRenew ? { setup_future_usage: "off_session" } : undefined,
      metadata: { type: "domain_purchase", uid, appId, domain, autoRenew: String(autoRenew) },
      success_url: `${returnUrl}?domain=purchased`,
      cancel_url: `${returnUrl}?domain=canceled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Couldn't start checkout." }, { status: 500 });
    }

    // Keyed by the Checkout Session ID so the webhook can look this up
    // directly off the event it receives, with no extra query needed.
    await commit(
      [
        createWrite(`domainOrders/${session.id}`, {
          userId: uid,
          appId,
          domain,
          years,
          vercelPrice: purchasePrice,
          chargedPrice: chargePrice,
          contact,
          autoRenew,
          status: "pending",
          createdAt: new Date(),
        }),
      ],
      idToken
    );

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to start domain purchase.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
