import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe, planForPriceId } from "@/lib/stripe";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { PLANS, isPlanId, type PlanId } from "@/lib/types";

export const runtime = "nodejs";

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
  if (subscriptionId) {
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    if (typeof sub.metadata?.uid === "string") return sub.metadata.uid;
  }
  if (!customerId) return undefined;
  const snap = await adminDb().collection("users").where("stripeCustomerId", "==", customerId).limit(1).get();
  return snap.empty ? undefined : snap.docs[0].id;
}

async function setPlan(uid: string, plan: PlanId) {
  await adminDb()
    .collection("users")
    .doc(uid)
    .set({ plan, credits: PLANS[plan].credits }, { merge: true });
}

async function revertToFree(uid: string) {
  // Leave whatever credit balance remains; only access level changes.
  await adminDb().collection("users").doc(uid).set({ plan: "free" }, { merge: true });
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
      const uid = session.client_reference_id ?? session.metadata?.uid;
      const plan = session.metadata?.plan;
      if (uid && isPlanId(plan) && plan !== "free") {
        await setPlan(uid, plan);
      } else {
        console.error("[stripe webhook] checkout.session.completed missing uid/plan metadata");
      }
      break;
    }

    // The delayed-payment counterpart to checkout.session.completed above:
    // grants the plan once the charge actually confirms.
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;
      const uid = session.client_reference_id ?? session.metadata?.uid;
      const plan = session.metadata?.plan;
      if (uid && isPlanId(plan) && plan !== "free") {
        await setPlan(uid, plan);
      } else {
        console.error("[stripe webhook] checkout.session.async_payment_succeeded missing uid/plan metadata");
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
      const subscriptionId =
        typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
      const uid = await findUid(stripe, customerId, subscriptionId);
      const priceId = invoice.lines.data[0]?.price?.id;
      const plan = priceId ? planForPriceId(priceId) : undefined;
      if (uid && plan) {
        await setPlan(uid, plan);
      } else {
        console.error("[stripe webhook] invoice.paid: couldn't resolve uid/plan", { customerId, priceId });
      }
      break;
    }

    // Fires when a subscription's price changes (e.g. the user switched
    // plans in the billing portal), separately from renewals.
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const uid =
        subscription.metadata?.uid ??
        (await findUid(
          stripe,
          typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id
        ));
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = priceId ? planForPriceId(priceId) : undefined;
      // A pending cancellation still has full access until the period
      // actually ends; customer.subscription.deleted handles that transition.
      if (uid && plan && !subscription.cancel_at_period_end) {
        await setPlan(uid, plan);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      const uid = subscription.metadata?.uid ?? (await findUid(stripe, customerId));
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
