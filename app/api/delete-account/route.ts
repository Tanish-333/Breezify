import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import {
  commit,
  deleteWrite,
  getDoc,
  listCollection,
  queryCollection,
  queryCollectionGroup,
  type FirestoreWrite,
} from "@/lib/firestore-rest";
import { FIREBASE_PUBLIC_CONFIG } from "@/lib/firebase-public-config";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";

// Firestore rejects a commit with more than 500 writes outright, so a
// power user with a lot of apps/transactions needs their deletes split
// across multiple commits rather than sent as one.
const COMMIT_BATCH_SIZE = 450;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

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

    const userDoc = await getDoc(`users/${uid}`, idToken);

    // Accounts can't be deleted within their first 30 days. Without this, a
    // free signup bonus can be farmed on a fast loop: sign up, spend the
    // credits, delete, sign up again. The one-time signups/{uid} marker
    // already stops the SAME uid from re-claiming a bonus, but this closes
    // the faster abuse this enables — churning through many short-lived
    // accounts rather than one long-lived one — by making each account cost
    // real time to cycle through, not just an email address.
    const ACCOUNT_DELETE_LOCK_MS = 30 * 24 * 60 * 60 * 1000;
    const createdAtRaw = userDoc?.fields.createdAt;
    const createdAtMs = typeof createdAtRaw === "string" ? Date.parse(createdAtRaw) : NaN;
    if (!Number.isNaN(createdAtMs)) {
      const elapsed = Date.now() - createdAtMs;
      if (elapsed < ACCOUNT_DELETE_LOCK_MS) {
        const daysLeft = Math.ceil((ACCOUNT_DELETE_LOCK_MS - elapsed) / (24 * 60 * 60 * 1000));
        return NextResponse.json(
          {
            error: `For account security, accounts can't be deleted until 30 days after signup. ${daysLeft} day${daysLeft === 1 ? "" : "s"} left.`,
          },
          { status: 403 }
        );
      }
    }

    // Deleting the account also deletes the only record of stripeCustomerId,
    // so if an active subscription isn't cancelled first, the user loses any
    // way to ever find or cancel it again and keeps getting billed forever
    // with no account. Cancel first and fail loudly if that doesn't work,
    // rather than deleting the account out from under a live subscription.
    // This has to run before anything is deleted: it's the only step here
    // that reaches out to a third party, and it's easy to retry safely if it
    // fails, unlike the identity/data deletion below.
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

    // Delete the Auth account next, via the Identity Toolkit REST API. This
    // takes the user's own ID token as proof of identity, no admin
    // credentials or service account needed, only the public Firebase Web
    // API key. Auth goes before Firestore so that if it fails, we bail out
    // before touching any Firestore data: the account and its data stay
    // intact and the user can just retry, rather than ending up with wiped
    // Firestore data under a still-live account (which would also silently
    // regrant a fresh signup bonus the next time auth state loads, since the
    // missing profile doc gets auto-recreated).
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
      // The raw Identity Toolkit REST error ("CREDENTIAL_TOO_OLD_LOGIN_AGAIN",
      // etc.) isn't something a user should ever see verbatim — map the
      // ones actually reachable here to something actionable. Falls back to
      // the raw code/body so an unmapped failure is still visible to
      // whoever's debugging it, just not shown wrapped in JSON braces.
      let code = "";
      try {
        code = JSON.parse(body)?.error?.message ?? "";
      } catch {
        // Non-JSON body; code stays empty and the fallback below is used.
      }
      const friendly: Record<string, string> = {
        CREDENTIAL_TOO_OLD_LOGIN_AGAIN: "For your security, please sign out and back in, then try deleting your account again.",
        TOKEN_EXPIRED: "Your session has expired. Please sign in again, then try deleting your account.",
        USER_NOT_FOUND: "This account no longer exists.",
      };
      throw new Error(friendly[code] || `Failed to delete account${code ? ` (${code})` : ""}. Please try again.`);
    }

    const [apps, transactions] = await Promise.all([
      queryCollection("apps", "userId", uid, idToken),
      queryCollection("transactions", "userId", uid, idToken),
    ]);

    // apps/{appId}/secrets, .../versions, and .../collaborators don't
    // cascade-delete with their parent (Firestore never does), and secrets'
    // own rules check ownership via get(apps/{appId}).data.userId — so if
    // the parent app doc were deleted first, or in a way this missed, those
    // documents wouldn't just be orphaned, they'd become permanently
    // unreadable and undeletable by anyone, including the account owner.
    // Secrets in particular can hold real third-party API keys, so this has
    // to run for every app, not skipped as an optimization.
    const subcollectionWrites = (
      await Promise.all(
        apps.map(async (a) => {
          const [secrets, versions, collaborators] = await Promise.all([
            listCollection(`apps/${a.id}/secrets`, idToken).catch(() => []),
            listCollection(`apps/${a.id}/versions`, idToken).catch(() => []),
            listCollection(`apps/${a.id}/collaborators`, idToken).catch(() => []),
          ]);
          return [
            ...secrets.map((s) => deleteWrite(`apps/${a.id}/secrets/${s.id}`)),
            ...versions.map((v) => deleteWrite(`apps/${a.id}/versions/${v.id}`)),
            ...collaborators.map((c) => deleteWrite(`apps/${a.id}/collaborators/${c.id}`)),
          ];
        })
      )
    ).flat();

    // This account may also be a COLLABORATOR on apps it doesn't own — those
    // apps/{appId}/collaborators/{uid} docs live under someone else's app
    // and aren't touched by anything above (which only ever looks at apps
    // this uid owns). Without this, "delete your account permanently" left
    // this uid's email/uid listed on every app it was ever invited to
    // forever: a permanent ghost entry nobody can reclaim except the app
    // owner manually noticing and removing it, and this account's data
    // wasn't actually fully purged despite what deletion promised.
    // firestore.rules' collaborators/{collabUid} read/delete rule already
    // allows the collaborator to act on their own entry (isOwner(collabUid))
    // regardless of which app it's nested under, which is what makes this
    // collection-group query/delete valid under the caller's own idToken.
    let ownCollaboratorEntries: { path: string }[] = [];
    try {
      const allEntries = await queryCollectionGroup("collaborators", "uid", uid, idToken);
      // Entries on apps this uid itself owns are already covered by
      // subcollectionWrites above (deleted alongside the whole app) — only
      // entries on someone ELSE's app are new here.
      const ownAppIds = new Set(apps.map((a) => a.id));
      ownCollaboratorEntries = allEntries.filter((e) => {
        const appId = e.path.split("/")[1];
        return !ownAppIds.has(appId);
      });
    } catch (err) {
      console.error(`[delete-account] uid=${uid} failed to look up collaborator entries on other apps:`, err);
    }

    const writes: FirestoreWrite[] = [
      ...subcollectionWrites,
      ...apps.map((a) => deleteWrite(`apps/${a.id}`)),
      ...transactions.map((t) => deleteWrite(`transactions/${t.id}`)),
      ...ownCollaboratorEntries.map((e) => deleteWrite(e.path)),
      deleteWrite(`users/${uid}`),
    ];
    if (writes.length > 0) {
      // Best-effort at this point: the Auth account is already gone, so a
      // failure here just leaves orphaned, unreachable Firestore documents
      // rather than putting the user's account or data at risk. Still
      // logged (not swallowed) so a failure is at least visible in Vercel's
      // logs instead of silently claiming success while nothing was
      // actually deleted.
      const batches = chunk(writes, COMMIT_BATCH_SIZE);
      for (const batch of batches) {
        await commit(batch, idToken).catch((err) => {
          console.error(`[delete-account] uid=${uid} failed to delete a batch of ${batch.length} writes:`, err);
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete account.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
