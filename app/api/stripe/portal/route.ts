import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { getDoc } from "@/lib/firestore-rest";
import {
  getDowngradeLockedPortalConfigId,
  getStripe,
  isStripeConfigured,
  maxDowngradeLockStatus,
  resolveStripeCustomerId,
} from "@/lib/stripe";
import { isPlanId, type PlanId } from "@/lib/types";

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

    const userDoc = await getDoc(`users/${uid}`, idToken);
    let customerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;
    if (!customerId) {
      customerId = await resolveStripeCustomerId(uid, email, idToken);
    }
    if (!customerId) {
      const plan = typeof userDoc?.fields.plan === "string" ? (userDoc.fields.plan as string) : "free";
      return NextResponse.json(
        {
          error:
            plan === "free"
              ? "No billing account found yet. Subscribe to a plan first."
              : "Your plan wasn't set up through Stripe, so there's no billing portal for it. Contact support if you need to change or cancel it.",
        },
        { status: 400 }
      );
    }

    const plan: PlanId = isPlanId(userDoc?.fields.plan) ? (userDoc!.fields.plan as PlanId) : "free";
    const maxUpgradedAt = typeof userDoc?.fields.maxUpgradedAt === "string" ? userDoc.fields.maxUpgradedAt : undefined;
    const { locked } = maxDowngradeLockStatus(plan, maxUpgradedAt);

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/billing`;
    let configuration: string | undefined;
    if (locked) {
      try {
        configuration = await getDowngradeLockedPortalConfigId();
      } catch (err) {
        // Fail open to the normal portal rather than blocking billing
        // management entirely (payment method, invoices) over a Stripe API
        // hiccup fetching/creating the restricted configuration — see the
        // doc comment on getDowngradeLockedPortalConfigId for why this
        // needs verifying in Stripe test mode.
        console.error("[stripe/portal] Couldn't get the downgrade-locked portal configuration, opening normal portal:", err);
      }
    }

    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      ...(configuration ? { configuration } : {}),
    });

    return NextResponse.json({ url: session.url, downgradeLocked: locked });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open billing portal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
