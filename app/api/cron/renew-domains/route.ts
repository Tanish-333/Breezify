import { NextRequest, NextResponse } from "next/server";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  getDomainPrice,
  isDeployConfigured,
  pollDomainOrder,
  purchaseDomainOnVercel,
  type DomainContact,
} from "@/lib/vercel-deploy";
import { sendEmail } from "@/lib/email";
import { markedUpDomainPrice } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// *** THIS ROUTE MOVES REAL MONEY. ***
// Unlike app/api/cron/cleanup (which only touches Breezify's own data),
// this one charges a customer's saved card off-session, unattended, and
// only then extends their domain registration. It's fully wired here but
// deliberately NOT added to vercel.json's crons — exercise it against
// Stripe test mode (and confirm what purchaseDomainOnVercel actually does
// when called again for a domain Breezify already owns, since that
// specific behavior has no live environment here to verify against) before
// adding:
//   { "path": "/api/cron/renew-domains", "schedule": "0 3 * * *" }

// Wide enough to comfortably catch a domain before it actually expires even
// if this doesn't run every single day; narrow enough that it isn't
// attempting a renewal months ahead of when it's actually needed.
const RENEW_WITHIN_MS = 21 * 24 * 60 * 60 * 1000;
// A domain nearing expiry stays inside RENEW_WITHIN_MS for weeks — without
// this, a daily run would re-attempt (and re-attempt charging) a failed
// renewal every single day instead of backing off.
const RETRY_COOLOFF_MS = 20 * 60 * 60 * 1000;

async function notifyOwner(userId: string, domain: string, message: string) {
  try {
    const userSnap = await adminDb().collection("users").doc(userId).get();
    const email = userSnap.get("email") as string | undefined;
    if (!email) return;
    await sendEmail({
      to: email,
      subject: `Action needed: ${domain} wasn't renewed automatically`,
      html: `<p>${message}</p><p>Domain: <strong>${domain}</strong></p><p>Auto-renew has been turned off for this domain so it doesn't keep retrying — renew it manually from the app's Domain panel before it expires.</p>`,
    });
  } catch (err) {
    console.error(`[cron/renew-domains] userId=${userId} domain=${domain} failed to send notice:`, err);
  }
}

async function renewDomains() {
  if (!isFirebaseAdminConfigured() || !isStripeConfigured() || !isDeployConfigured()) {
    return { status: "skipped", message: "Firebase Admin, Stripe, or Vercel isn't configured." };
  }
  const db = adminDb();
  const stripe = getStripe();
  const cutoff = Date.now() + RENEW_WITHIN_MS;

  // Single-field equality, no composite index required — same reasoning as
  // app/api/cron/cleanup's own query.
  const snap = await db.collection("apps").where("domainAutoRenew", "==", true).get();

  let renewed = 0;
  let failed = 0;
  let skipped = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const domain = data.customDomain as string | undefined;
    if (!data.domainPurchased || !domain) {
      skipped++;
      continue;
    }

    const expiresAtMs = data.domainExpiresAt ? Date.parse(data.domainExpiresAt) : NaN;
    if (Number.isNaN(expiresAtMs) || expiresAtMs > cutoff) {
      skipped++;
      continue;
    }

    if (expiresAtMs < Date.now()) {
      // Already lapsed. Renewing a domain after it's actually expired isn't
      // the same registrar operation as renewing before it (may need a
      // redemption process this doesn't attempt), and charging for a
      // renewal of a domain that's already gone would be indefensible.
      await docSnap.ref.update({ domainAutoRenew: false });
      await notifyOwner(data.userId, domain, "Your domain expired before it could be renewed automatically.");
      failed++;
      continue;
    }

    const lastAttemptMs = data.domainRenewLastAttemptAt ? Date.parse(data.domainRenewLastAttemptAt) : 0;
    if (Date.now() - lastAttemptMs < RETRY_COOLOFF_MS) {
      skipped++;
      continue;
    }
    await docSnap.ref.update({ domainRenewLastAttemptAt: new Date().toISOString() });

    const orderId = data.domainOrderId as string | undefined;
    const userSnap = await db.collection("users").doc(data.userId).get();
    const customerId = userSnap.get("stripeCustomerId") as string | undefined;

    if (!customerId || !orderId) {
      await docSnap.ref.update({ domainAutoRenew: false });
      await notifyOwner(
        data.userId,
        domain,
        customerId
          ? "We couldn't find the original order to renew your domain from."
          : "We couldn't find a saved payment method to renew your domain automatically."
      );
      failed++;
      continue;
    }

    let paymentIntentId: string | undefined;
    try {
      const orderSnap = await db.collection("domainOrders").doc(orderId).get();
      const contact = orderSnap.get("contact") as DomainContact | undefined;
      if (!contact) throw new Error(`domainOrders/${orderId} has no registrant contact on file.`);

      const { purchasePrice, years } = await getDomainPrice(domain, 1);
      const chargePrice = markedUpDomainPrice(purchasePrice);

      const pi = await stripe.paymentIntents.create({
        amount: Math.round(chargePrice * 100),
        currency: "usd",
        customer: customerId,
        off_session: true,
        confirm: true,
        description: `Domain renewal: ${domain}`,
        metadata: { type: "domain_renewal", appId: docSnap.id, domain },
      });
      paymentIntentId = pi.id;
      if (pi.status !== "succeeded") {
        throw new Error(`Payment did not succeed (status: ${pi.status}).`);
      }

      try {
        const vercelOrderId = await purchaseDomainOnVercel(domain, years, purchasePrice, contact, true);
        await pollDomainOrder(vercelOrderId);
      } catch (registrarErr) {
        // Charged but the registrar side didn't go through — refund rather
        // than leave the customer paying for a renewal that didn't happen.
        // This exact call (buying again on a domain Breezify already owns)
        // is the one part of this flow with no live environment here to
        // verify against ahead of time; this refund path is exactly why
        // it's safe to find out for real rather than assume.
        try {
          await stripe.refunds.create({ payment_intent: paymentIntentId });
        } catch (refundErr) {
          console.error(
            `[cron/renew-domains] appId=${docSnap.id} domain=${domain} refund ALSO failed after a renewal that didn't register — needs manual handling. paymentIntent=${paymentIntentId}`,
            refundErr
          );
        }
        throw registrarErr;
      }

      const newExpiresAt = new Date(expiresAtMs);
      newExpiresAt.setFullYear(newExpiresAt.getFullYear() + years);
      await docSnap.ref.update({
        domainExpiresAt: newExpiresAt.toISOString(),
        domainRenewLastAttemptAt: null,
      });
      renewed++;
    } catch (err) {
      console.error(`[cron/renew-domains] appId=${docSnap.id} domain=${domain} renewal failed:`, err);
      await docSnap.ref.update({ domainAutoRenew: false });
      await notifyOwner(
        data.userId,
        domain,
        "We tried to renew your domain automatically but it didn't go through."
      );
      failed++;
    }
  }

  return { status: "completed", message: `Renewed ${renewed}, failed ${failed}, skipped ${skipped}.` };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await renewDomains();
    return NextResponse.json({ timestamp: new Date().toISOString(), ...result });
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
