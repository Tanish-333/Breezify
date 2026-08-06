import Stripe from "stripe";
import { commit, getDoc, updateWrite } from "@/lib/firestore-rest";
import type { PlanId } from "@/lib/types";

// A Max subscriber can't downgrade (or cancel down to a lower plan) for
// this long after upgrading TO Max — see maxUpgradedAt, stamped only on
// that specific transition by app/api/stripe/webhook's setPlan().
export const MAX_DOWNGRADE_LOCK_MS = 30 * 24 * 60 * 60 * 1000;

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
/** Pure date math — whether a Max subscriber is still inside the 30-day downgrade lock, and until when. */
export function maxDowngradeLockStatus(
  plan: PlanId,
  maxUpgradedAt: string | undefined
): { locked: boolean; until: number | null } {
  if (plan !== "max" || !maxUpgradedAt) return { locked: false, until: null };
  const upgradedMs = Date.parse(maxUpgradedAt);
  if (Number.isNaN(upgradedMs)) return { locked: false, until: null };
  const until = upgradedMs + MAX_DOWNGRADE_LOCK_MS;
  return { locked: Date.now() < until, until };
}

let cachedLockedPortalConfigId: string | null = null;

/**
 * A Stripe Billing Portal Configuration with subscription changes/
 * cancellation disabled entirely — used instead of the account's normal
 * configuration when opening the portal for a Max subscriber still inside
 * their 30-day downgrade lock, so the lock can't just be bypassed by using
 * Stripe's own hosted portal UI directly. Payment method updates and
 * invoice history stay enabled; only plan changes and cancellation are
 * blocked.
 *
 * Found-or-created once per Stripe account (tagged via metadata so a cold
 * start doesn't keep creating duplicates), then cached in memory for the
 * life of this process. This is new Stripe API surface with no live Stripe
 * environment here to verify the exact configuration shape against ahead
 * of time — exercise this in Stripe test mode (open "Manage billing" as a
 * Max subscriber inside the lock window, confirm the portal shows no plan-
 * change or cancel option) before relying on it. If configuration lookup/
 * creation fails for any reason, the caller falls back to the account's
 * normal portal rather than blocking billing management entirely over a
 * Stripe API hiccup — see app/api/stripe/portal/route.ts.
 */
export async function getDowngradeLockedPortalConfigId(): Promise<string> {
  if (cachedLockedPortalConfigId) return cachedLockedPortalConfigId;
  const stripe = getStripe();
  const METADATA_TAG = "breezify_max_downgrade_lock";

  const existing = await stripe.billingPortal.configurations.list({ limit: 100 });
  const found = existing.data.find((c) => c.metadata?.purpose === METADATA_TAG);
  if (found) {
    cachedLockedPortalConfigId = found.id;
    return found.id;
  }

  const defaults = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
  const base = defaults.data[0];
  const created = await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: base?.business_profile.headline ?? undefined,
      privacy_policy_url: base?.business_profile.privacy_policy_url ?? undefined,
      terms_of_service_url: base?.business_profile.terms_of_service_url ?? undefined,
    },
    metadata: { purpose: METADATA_TAG },
    features: {
      customer_update: base?.features.customer_update ?? { enabled: true, allowed_updates: ["email"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: false, cancellation_reason: { enabled: false, options: [] } },
      subscription_update: { enabled: false, default_allowed_updates: null, products: null },
    },
  });
  cachedLockedPortalConfigId = created.id;
  return created.id;
}

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
