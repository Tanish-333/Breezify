import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, deleteWrite, getDoc, queryCollection } from "@/lib/firestore-rest";
import { FIREBASE_PUBLIC_CONFIG } from "@/lib/firebase-public-config";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    let uid: string;
    try {
      uid = (await verifyIdToken(idToken)).uid;
    } catch {
      return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
    }

    const [apps, transactions, userDoc] = await Promise.all([
      queryCollection("apps", "userId", uid, idToken),
      queryCollection("transactions", "userId", uid, idToken),
      getDoc(`users/${uid}`, idToken),
    ]);

    // Deleting the account also deletes the only record of stripeCustomerId,
    // so if an active subscription isn't cancelled first, the user loses any
    // way to ever find or cancel it again and keeps getting billed forever
    // with no account. Cancel first and fail loudly if that doesn't work,
    // rather than deleting the account out from under a live subscription.
    const customerId =
      typeof userDoc?.fields.stripeCustomerId === "string"
        ? (userDoc.fields.stripeCustomerId as string)
        : undefined;
    if (customerId && isStripeConfigured()) {
      try {
        const stripe = getStripe();
        const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
        const active = subs.data.filter(
          (s) => s.status !== "canceled" && s.status !== "incomplete_expired"
        );
        await Promise.all(active.map((s) => stripe.subscriptions.cancel(s.id)));
      } catch (err) {
        console.error("[delete-account] Failed to cancel Stripe subscription:", err);
        return NextResponse.json(
          {
            error:
              "Couldn't cancel your active subscription. Please cancel it from the Billing page, then try deleting your account again.",
          },
          { status: 500 }
        );
      }
    }

    const writes = [
      ...apps.map((a) => deleteWrite(`apps/${a.id}`)),
      ...transactions.map((t) => deleteWrite(`transactions/${t.id}`)),
      deleteWrite(`users/${uid}`),
    ];
    if (writes.length > 0) {
      await commit(writes, idToken);
    }

    // Self-delete the Auth account via the Identity Toolkit REST API. This
    // takes the user's own ID token as proof of identity, no admin
    // credentials or service account needed, only the public Firebase Web
    // API key.
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${FIREBASE_PUBLIC_CONFIG.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Failed to delete account (${res.status}): ${body}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
