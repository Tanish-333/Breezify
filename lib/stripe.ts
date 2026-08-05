import Stripe from "stripe";
import { commit, updateWrite } from "@/lib/firestore-rest";
import type { PlanId } from "@/lib/types";

let client: Stripe | null = null;

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Payments aren't configured on this deployment yet. Set STRIPE_SECRET_KEY.");
  }
  if (!client) client = new Stripe(key);
  return client;
}

// Each paid plan maps to a Stripe recurring Price ID, created in the
// Stripe dashboard (Product catalog -> Add product -> monthly price).
const PRICE_ENV: Partial<Record<PlanId, string | undefined>> = {
  plus: process.env.STRIPE_PLUS_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID,
  max: process.env.STRIPE_MAX_PRICE_ID,
};

export function priceIdFor(plan: PlanId): string | undefined {
  return PRICE_ENV[plan];
}

/** The paid plan a Stripe Price ID belongs to, or undefined if none match. */
export function planForPriceId(priceId: string): PlanId | undefined {
  return (Object.keys(PRICE_ENV) as PlanId[]).find((plan) => PRICE_ENV[plan] === priceId);
}

/**
 * stripeCustomerId is normally set one of two ways: a client-side write right
 * after checkout (create-checkout-session/route.ts), backstopped by the
 * webhook's own backfill (app/api/stripe/webhook's setPlan()). If BOTH ever
 * missed — the webhook isn't registered in the Stripe Dashboard yet, or a
 * subscription predates either code path existing — a real paying customer
 * ends up with no stripeCustomerId on file at all, and every billing action
 * (portal, cancel, status) permanently reads "no billing account found," even
 * though Stripe has a real customer for their email the whole time.
 *
 * This is the last-resort recovery: look the customer up by email directly
 * against Stripe (their email is already verified via their Firebase ID
 * token, so this isn't taking the client's word for whose account it is),
 * and backfill the id into Firestore so every future call finds it directly
 * without needing this fallback again.
 */
export async function resolveStripeCustomerId(
  uid: string,
  email: string | undefined,
  idToken: string
): Promise<string | undefined> {
  if (!email) return undefined;
  const stripe = getStripe();
  const matches = await stripe.customers.list({ email, limit: 2 });
  if (matches.data.length !== 1) {
    // Zero matches: genuinely never subscribed. More than one: an ambiguous
    // recovery is worse than none — surfacing "no billing account found"
    // (the existing behavior) is safer than silently guessing which
    // customer record is actually this person's.
    return undefined;
  }
  const customerId = matches.data[0].id;
  await commit(
    [updateWrite(`users/${uid}`, { stripeCustomerId: customerId }, ["stripeCustomerId"])],
    idToken
  ).catch(() => {
    // Best-effort — the caller still got a usable customerId for this
    // request even if the backfill write itself failed.
  });
  return customerId;
}
