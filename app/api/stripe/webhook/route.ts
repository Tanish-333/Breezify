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

  // Skip anything already processed (Stripe retries on any non-2xx, or if our
  // own response is slow), so an app never gets double-credited.
  const eventRef = adminDb().collection("stripe_events").doc(event.id);
  if ((await eventRef.get()).exists) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.client_reference_id ?? session.metadata?.uid;
        const plan = session.metadata?.plan;
        if (uid && isPlanId(plan) && plan !== "free") {
          await setPlan(uid, plan);
        } else {
          console.error("[stripe webhook] checkout.session.completed missing uid/plan metadata");
        }
        break;
      }

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

    await eventRef.set({ type: event.type, processedAt: new Date().toISOString() });
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error(`[stripe webhook] Failed to handle ${event.type}:`, err);
    return NextResponse.json({ error: "Failed to process event." }, { status: 500 });
  }
}
