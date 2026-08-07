import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import type { DocumentReference, DocumentData } from "firebase-admin/firestore";
import { getStripe, planForPriceId } from "@/lib/stripe";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import {
  addProjectDomain,
  pollDomainOrder,
  projectSlugFromDeployedUrl,
  purchaseDomainOnVercel,
  type DomainContact,
} from "@/lib/vercel-deploy";
import { PLANS, isPlanId, type PlanId } from "@/lib/types";

export const runtime = "nodejs";
// Domain registration is polled synchronously below (Vercel's buy is async),
// which routinely takes longer than the platform's default function timeout.
export const maxDuration = 60;

/**
 * The one place in this app that writes plan/credits without a user's own ID
 * token behind it, since Stripe calls this directly, there's no user in the
 * request to authenticate as. See lib/firebase-admin.ts for why that's safe
 * and narrowly scoped.
 */

async function findUid(
  stripe: Stripe,
  customerId: string | null,
  subscriptionId?: string | null
): Promise<string | undefined> {
  // This account is shared across several apps on the same Firebase
  // project's Auth, so a subscription's metadata.uid alone isn't
  // trustworthy — it could be a real uid set by a DIFFERENT app's checkout.
  // Verifying it against Breezify's own users collection is what makes this
  // fast path safe to use instead of always falling through to the
  // customerId lookup below.
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const metaUid = sub.metadata?.uid;
    if (typeof metaUid === "string") {
      const doc = await adminDb().collection("users").doc(metaUid).get();
      if (doc.exists) return metaUid;
    }
  }
  if (!customerId) return undefined;
  const snap = await adminDb().collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
  return snap.empty ? undefined : snap.docs[0].id;
}

/**
 * customerId is optional and, when given, backfilled via the Admin SDK
 * alongside the plan itself — a reliable backstop for create-checkout-
 * session/route.ts's own client-side save of the same field, which uses the
 * caller's own idToken and silently swallows a write failure (network blip,
 * a closed tab right after redirect). Without this, that one failure mode
 * permanently locks a real, paying subscriber out of "Manage billing" and
 * their own subscription status — plan/credits still land correctly here
 * either way, but stripeCustomerId would never get set by anything else.
 */
async function setPlan(uid: string, plan: PlanId, customerId?: string) {
  const ref = adminDb().collection("users").doc(uid);
  const updates: Record<string, unknown> = {
    plan,
    credits: PLANS[plan].credits,
    ...(customerId ? { stripeCustomerId: customerId } : {}),
  };
  // Stamped only on the transition INTO max from something else — a
  // renewal (invoice.paid firing every month while already on Max)
  // must never reset this, or the 30-day downgrade lock (see
  // MAX_DOWNGRADE_LOCK_MS in app/api/stripe/portal/route.ts) would never
  // actually expire for someone who stays on Max.
  if (plan === "max") {
    const snap = await ref.get();
    if (snap.data()?.plan !== "max") {
      updates.maxUpgradedAt = new Date().toISOString();
    }
  }
  await ref.set(updates, { merge: true });
}

/**
 * This Stripe account is shared across several of this developer's apps,
 * all on the same Firebase project's Auth (and therefore the same uid
 * namespace). A checkout session's own metadata.uid is trustworthy for the
 * app that CREATED it (see create-checkout-session/route.ts, which always
 * sets it from the caller's own verified ID token), but this webhook
 * receives every checkout on the account — including another app's, whose
 * metadata.uid could coincidentally be a real Breezify uid, or whose
 * metadata.plan could coincidentally match one of Breezify's plan names.
 * Requiring the uid to already have a Breezify profile is what stops a
 * same-uid coincidence from a different app's purchase granting a Breezify
 * plan: a brand-new Breezify subscriber always has a users/{uid} doc from
 * signup, long before their first checkout.
 */
async function isKnownBreezifyUser(uid: string): Promise<boolean> {
  const doc = await adminDb().collection("users").doc(uid).get();
  return doc.exists;
}

async function revertToFree(uid: string) {
  // Leave whatever credit balance remains; only access level changes.
  await adminDb().collection("users").doc(uid).set({ plan: "free" }, { merge: true });
}

/**
 * Refunds a domain purchase that failed before or during Vercel
 * registration — the customer was already charged by Stripe (payment_status
 * "paid" is what triggers this whole flow), so a failure past that point
 * must give the money back rather than silently keep it. Never called for a
 * timeout mid-registration (see pollDomainOrder below): only for a genuine
 * "this didn't happen" outcome, where refunding is unambiguously correct.
 */
async function refundDomainOrder(
  stripe: Stripe,
  orderRef: DocumentReference<DocumentData>,
  paymentIntent: string | null,
  error: unknown
) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[stripe webhook] domain purchase failed, refunding:", message);
  try {
    if (paymentIntent) {
      await stripe.refunds.create({ payment_intent: paymentIntent });
    }
  } catch (refundErr) {
    console.error("[stripe webhook] refund also failed — needs manual handling:", refundErr);
  }
  await orderRef.set(
    { status: "failed", error: message, refunded: true, failedAt: new Date().toISOString() },
    { merge: true }
  );
}

async function handleDomainPurchase(stripe: Stripe, session: Stripe.Checkout.Session) {
  if (session.payment_status !== "paid") return;

  const orderRef = adminDb().collection("domainOrders").doc(session.id);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) {
    console.error("[stripe webhook] domain_purchase checkout with no matching domainOrders doc", session.id);
    return;
  }
  const order = orderSnap.data()!;
  if (order.status === "completed" || order.status === "refunded") return; // Already handled.

  const paymentIntent =
    typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;

  // Best-effort, and only once: saves the card used here as the customer's
  // default payment method, so app/api/cron/renew-domains can actually
  // charge it off-session next year. A failure here must never block the
  // domain purchase itself — it just means that cron job will find no saved
  // card to charge later and fall back to notifying the customer instead of
  // silently renewing, same as if auto-renew were off.
  if (order.autoRenew && session.customer && paymentIntent && !order.vercelOrderId) {
    try {
      const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
      const pi = await stripe.paymentIntents.retrieve(paymentIntent);
      const paymentMethodId =
        typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
      if (paymentMethodId) {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
      }
      // This may be the buyer's very first Stripe interaction (e.g. a free-
      // plan user buying a domain with no prior subscription), in which
      // case they had no stripeCustomerId yet and the purchase route asked
      // Stripe to create one fresh — mirror what create-checkout-session/
      // route.ts does client-side after its own checkout. Safe to always
      // set: this webhook has no user token to check the existing value
      // through firestore-rest, and re-writing the same id is a no-op.
      await adminDb().collection("users").doc(order.userId).set({ stripeCustomerId: customerId }, { merge: true });
    } catch (err) {
      console.error("[stripe webhook] domain purchase: couldn't save a default payment method for auto-renew:", err);
    }
  }

  let vercelOrderId: string | undefined = order.vercelOrderId;
  if (!vercelOrderId) {
    await orderRef.set({ status: "purchasing" }, { merge: true });
    try {
      vercelOrderId = await purchaseDomainOnVercel(
        order.domain,
        order.years,
        order.vercelPrice,
        order.contact as DomainContact,
        // Belt-and-suspenders: app/api/cron/renew-domains is what's meant to
        // proactively charge the customer and extend the registration
        // before it lapses, but if that job is ever misconfigured or fails
        // silently, this still gives Vercel's own registrar auto-renew a
        // chance to save the domain — at Breezify's own cost until it's
        // recovered from the customer, which beats losing the domain
        // outright.
        Boolean(order.autoRenew)
      );
      await orderRef.set({ vercelOrderId }, { merge: true });
    } catch (err) {
      await refundDomainOrder(stripe, orderRef, paymentIntent, err);
      return;
    }
  }

  await pollDomainOrder(vercelOrderId); // Throws on failure/timeout — see its own doc comment.

  const appDoc = await adminDb().collection("apps").doc(order.appId).get();
  const deployedUrl = appDoc.data()?.deployedUrl as string | undefined;
  const slug = deployedUrl ? projectSlugFromDeployedUrl(deployedUrl) : null;

  let verified = false;
  if (slug) {
    try {
      const status = await addProjectDomain(slug, order.domain);
      // "verified" here means actually live — a domain bought through
      // Vercel's own registrar typically has DNS auto-configured, but that
      // can lag briefly behind the purchase, and misconfigured is the same
      // "not actually routing yet" signal used for domains attached
      // manually (see the isLive checks in app/api/domains/route.ts). The
      // owner's own "Check status" recheck covers the case where this
      // lands false right after purchase.
      verified = status.verified && !status.misconfigured;
    } catch (err) {
      // The domain is bought and non-refundable at this point regardless —
      // log loudly for manual attachment rather than losing the purchase.
      console.error("[stripe webhook] domain purchased but couldn't attach to Vercel project:", err);
    }
  } else {
    console.error("[stripe webhook] domain purchased but app has no deployed project to attach to:", order.appId);
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + (order.years ?? 1));

  await adminDb()
    .collection("apps")
    .doc(order.appId)
    .set(
      {
        customDomain: order.domain,
        customDomainVerified: verified,
        domainPurchased: true,
        domainExpiresAt: expiresAt.toISOString(),
        domainAutoRenew: Boolean(order.autoRenew),
        // Just the order id, not the registrant contact itself (name/
        // address/phone): apps/{appId} is readable by any collaborator
        // (see firestore.rules), and that's real PII the owner never
        // agreed to share just by inviting someone to work on the app —
        // same boundary already drawn around secrets. A session id reveals
        // nothing sensitive, and lets app/api/cron/renew-domains fetch
        // domainOrders/{sessionId} directly (a single doc get, no index
        // needed) for the contact when it's time to renew, via the Admin
        // SDK, which bypasses rules the same way this webhook does.
        domainOrderId: session.id,
      },
      { merge: true }
    );

  await orderRef.set({ status: "completed", completedAt: new Date().toISOString() }, { merge: true });
}

async function handleEvent(stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      // Delayed-confirmation payment methods (SEPA Debit, ACH credit
      // transfer, etc.) fire this event right away with payment_status
      // "unpaid"; the real outcome arrives later via
      // checkout.session.async_payment_succeeded/failed. Only grant here
      // once Stripe has actually confirmed the charge landed, so a payment
      // that later fails was never granted in the first place.
      if (session.payment_status !== "paid") break;
      if (session.metadata?.type === "domain_purchase") {
        await handleDomainPurchase(stripe, session);
        break;
      }
      const uid = session.client_reference_id ?? session.metadata?.uid;
      const plan = session.metadata?.plan;
      if (!uid || !(await isKnownBreezifyUser(uid))) break; // Not a Breezify checkout.
      if (isPlanId(plan) && plan !== "free") {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        await setPlan(uid, plan, customerId);
      } else {
        console.error("[stripe webhook] checkout.session.completed: known uid but missing/invalid plan", { uid });
      }
      break;
    }

    // The delayed-payment counterpart to checkout.session.completed above:
    // grants the plan (or completes the domain purchase) once the charge
    // actually confirms.
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.metadata?.type === "domain_purchase") {
        await handleDomainPurchase(stripe, session);
        break;
      }
      const uid = session.client_reference_id ?? session.metadata?.uid;
      const plan = session.metadata?.plan;
      if (!uid || !(await isKnownBreezifyUser(uid))) break; // Not a Breezify checkout.
      if (isPlanId(plan) && plan !== "free") {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        await setPlan(uid, plan, customerId);
      } else {
        console.error("[stripe webhook] checkout.session.async_payment_succeeded: known uid but missing/invalid plan", { uid });
      }
      break;
    }

    // Nothing was granted at checkout.session.completed time (payment_status
    // wasn't "paid" yet), so there's nothing to revert here — this case
    // exists only so the event is acknowledged instead of retried forever.
    case "checkout.session.async_payment_failed":
      break;

    // Fires on every successful recurring renewal; refills credits for the new period.
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      // Recent API versions moved this off a top-level invoice.subscription
      // field (removed entirely) to invoice.parent.subscription_details —
      // see the InvoiceLineItem/Invoice type definitions in the installed
      // stripe package for the current shape.
      const subRef = invoice.parent?.subscription_details?.subscription;
      const subscriptionId = typeof subRef === "string" ? subRef : subRef?.id;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
      const uid = await findUid(stripe, customerId, subscriptionId);
      // findUid() only ever returns a uid for a customer that exists in
      // Breezify's own users collection (or a subscription tagged with a
      // Breezify uid) — if it's undefined, this event belongs to some other
      // product on the same Stripe account (this account is shared across
      // several of this developer's apps), not a real problem to log.
      if (!uid) break;

      // Also moved: a line item's price used to be a directly-expanded
      // `price` object; it's now nested under `pricing.price_details.price`
      // (typically a plain id string, not expanded, in a webhook payload).
      const priceRef = invoice.lines.data[0]?.pricing?.price_details?.price;
      let priceId = typeof priceRef === "string" ? priceRef : priceRef?.id;
      // The line item doesn't always carry a resolvable price (e.g. certain
      // proration/invoice shapes) even though the subscription itself does;
      // fall back to asking the subscription directly, the same place
      // customer.subscription.updated below reads it from successfully.
      if (!priceId && subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        priceId = sub.items.data[0]?.price?.id;
      }
      const plan = priceId ? planForPriceId(priceId) : undefined;
      if (plan) {
        await setPlan(uid, plan, customerId ?? undefined);
      } else {
        // uid resolved (this IS a Breezify subscriber) but the price
        // couldn't be mapped to a plan — a real anomaly worth surfacing,
        // unlike the "not our event" case above.
        console.error("[stripe webhook] invoice.paid: resolved uid but not plan", { uid, customerId, priceId });
      }
      break;
    }

    // Fires when a subscription's price changes (e.g. the user switched
    // plans in the billing portal), separately from renewals.
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      // Routed through findUid() rather than trusting subscription.metadata.uid
      // directly, same reasoning as invoice.paid above: this account is
      // shared across apps, and only findUid() verifies the uid actually has
      // a Breezify profile before it's used.
      const uid = await findUid(stripe, customerId, subscription.id);
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = priceId ? planForPriceId(priceId) : undefined;
      // A pending cancellation still has full access until the period
      // actually ends; customer.subscription.deleted handles that transition.
      if (uid && plan && !subscription.cancel_at_period_end) {
        await setPlan(uid, plan, customerId);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const uid = await findUid(stripe, customerId, subscription.id);
      if (uid) await revertToFree(uid);
      break;
    }

    default:
      break;
  }
}

export async function POST(req: NextRequest) {
  if (!isFirebaseAdminConfigured()) {
    console.error("[stripe webhook] FIREBASE_SERVICE_ACCOUNT isn't set; can't update accounts.");
    return NextResponse.json({ error: "Server misconfigured." }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const db = adminDb();
  const eventRef = db.collection("stripe_events").doc(event.id);

  // A processing run is presumed genuinely still in flight for this long;
  // past it, treat it as crashed rather than block retries on it forever.
  const PROCESSING_STALE_MS = 60_000;

  // Atomically claim this event before doing any work, so two near-
  // simultaneous deliveries of the same event (Stripe's retries are
  // at-least-once) can't both pass the "already done?" check and double-
  // process a payment. A prior successful run is always skipped; a run
  // that's still actively processing is skipped too, unless it's stale
  // enough to have obviously crashed, in which case it's retried rather
  // than left permanently stuck (silently acknowledged to Stripe forever
  // without ever actually finishing).
  const claimed = await db.runTransaction(async (tx) => {
    const doc = await tx.get(eventRef);
    const data = doc.data();
    const startedAtMs = data?.startedAt ? Date.parse(data.startedAt) : 0;
    const stillProcessing =
      data?.status === "processing" && Date.now() - startedAtMs < PROCESSING_STALE_MS;
    if (doc.exists && (data?.status === "done" || stillProcessing)) return false;
    tx.set(eventRef, { type: event.type, status: "processing", startedAt: new Date().toISOString() });
    return true;
  });
  if (!claimed) {
    return NextResponse.json({ received: true });
  }

  try {
    await handleEvent(stripe, event);
    await eventRef.set({ status: "done", processedAt: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe webhook] Failed to handle ${event.type}:`, err);
    await eventRef
      .set({ status: "failed", failedAt: new Date().toISOString() }, { merge: true })
      .catch(() => {});
    return NextResponse.json({ error: "Failed to process event." }, { status: 500 });
  }
}
