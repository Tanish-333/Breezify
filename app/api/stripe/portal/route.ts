import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { getDoc } from "@/lib/firestore-rest";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

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
    try {
      uid = (await verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    const userDoc = await getDoc(`users/${uid}`, idToken);
    const customerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;
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

    const returnUrl = `${process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin}/billing`;
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open billing portal.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
