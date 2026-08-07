import { NextRequest, NextResponse } from "next/server";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import {
  DomainOrderTimeoutError,
  getDomainPrice,
  isDeployConfigured,
  pollDomainOrder,
  renewDomainOnVercel,
} from "@/lib/vercel-deploy";
import { sendEmail } from "@/lib/email";
import { markedUpDomainPrice } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// *** THIS ROUTE MOVES REAL MONEY. ***
// Unlike app/api/cron/cleanup (which only touches Breezify's own data),
// this one charges a customer's saved card off-session, unattended, and
// only then extends their domain registration. It now calls Vercel's actual
// renew-a-domain endpoint (POST /v1/registrar/domains/{domain}/renew) rather
// than the buy endpoint it originally, incorrectly, reused for renewal —
// see renewDomainOnVercel's doc comment in lib/vercel-deploy.ts. That fixes
// the specific correctness concern this comment used to flag, but this
// still has never run against a real Stripe/Vercel account: watch its first
// few real firings (Vercel dashboard logs + the console.error lines below)
// once enabled, since RENEW_WITHIN_MS means it won't attempt anything for
// any domain bought after this shipped until that domain is genuinely close
// to expiring.

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

    const userSnap = await db.collection("users").doc(data.userId).get();
    const customerId = userSnap.get("stripeCustomerId") as string | undefined;

    // A standalone off-session PaymentIntent (unlike an Invoice/Subscription)
    // never auto-resolves the customer's default payment method — it must
    // be passed explicitly, or Stripe rejects confirmation outright. Without
    // this, every single renewal attempt failed even with a perfectly valid
    // saved card on file, silently turning auto-renew into "never actually
    // renews anything."
    let paymentMethodId: string | undefined;
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        const dpm = !("deleted" in customer) ? customer.invoice_settings?.default_payment_method : undefined;
        paymentMethodId = typeof dpm === "string" ? dpm : dpm?.id;
      } catch (err) {
        console.error(`[cron/renew-domains] appId=${docSnap.id} domain=${domain} failed to look up payment method:`, err);
      }
    }

    if (!customerId || !paymentMethodId) {
      await docSnap.ref.update({ domainAutoRenew: false });
      await notifyOwner(
        data.userId,
        domain,
        "We couldn't find a saved payment method to renew your domain automatically."
      );
      failed++;
      continue;
    }

    let paymentIntentId: string | undefined;
    try {
      // Renewing an already-owned domain, so no registrant contact is
      // needed here (Vercel already has it on file from the original
      // purchase) — see renewDomainOnVercel's own doc comment in
      // lib/vercel-deploy.ts for why this is a distinct call from a buy.
      const { purchasePrice, years } = await getDomainPrice(domain, 1);
      const chargePrice = markedUpDomainPrice(purchasePrice);

      const pi = await stripe.paymentIntents.create({
        amount: Math.round(chargePrice * 100),
        currency: "usd",
        customer: customerId,
        payment_method: paymentMethodId,
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
        const vercelOrderId = await renewDomainOnVercel(domain, years, purchasePrice);
        await pollDomainOrder(vercelOrderId);
      } catch (registrarErr) {
        // A genuine registrar failure means the renewal definitely didn't
        // happen — refund rather than leave the customer paying for
        // nothing. A mere TIMEOUT is different: the order may still
        // complete at Vercel moments later, so refunding here risks
        // giving the money back for a domain that ends up renewed anyway.
        // Neither this app nor this cron currently re-checks a pending
        // order after the fact, so a timeout is logged loudly for manual
        // follow-up rather than silently treated as a clean failure —
        // see the DomainOrderTimeoutError doc comment.
        if (registrarErr instanceof DomainOrderTimeoutError) {
          console.error(
            `[cron/renew-domains] appId=${docSnap.id} domain=${domain} renewal order still pending after poll window — NOT refunded (may still complete), needs manual verification. paymentIntent=${paymentIntentId}`,
            registrarErr
          );
          // Leave domainAutoRenew on and skip the "didn't go through" email
          // — this specific case isn't a confirmed failure, and the retry
          // cooloff already prevents hammering this domain again today.
          failed++;
          continue;
        }
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
