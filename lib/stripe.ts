import Stripe from "stripe";
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
