import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { adminAuth, adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { commit, deleteWrite, getDoc, listCollection, updateWrite } from "@/lib/firestore-rest";
import { sendCollaboratorInviteEmail } from "@/lib/email";
import {
  COLLABORATOR_MIN_PLAN,
  isCollaboratorRole,
  MAX_COLLABORATORS,
  PLAN_RANK,
  PLANS,
  type PlanId,
} from "@/lib/types";
import { getAppBaseUrl } from "@/lib/app-base-url";

export const runtime = "nodejs";

async function authenticate(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return { error: NextResponse.json({ error: "Missing authorization token." }, { status: 401 }) };
  }
  try {
    const uid = (await verifyIdToken(idToken)).uid;
    return { uid, idToken };
  } catch {
    return {
      error: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }),
    };
  }
}

/** Anyone with read access to the app (owner or an existing collaborator) can see the roster. */
export async function GET(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { idToken } = auth;

    // getDoc is itself rules-gated to the owner or an existing collaborator,
    // so a caller unrelated to this app is rejected right here.
    const doc = await getDoc(`apps/${params.appId}`, idToken);
    if (!doc) return NextResponse.json({ error: "App not found." }, { status: 404 });
    const ownerUid = doc.fields.userId as string;

    // Best-effort — the roster is still useful without it (just an unlabeled
    // owner row client-side), and this is display-only, never used for any
    // access decision.
    let ownerEmail: string | undefined;
    if (isFirebaseAdminConfigured()) {
      try {
        ownerEmail = (await adminAuth().getUser(ownerUid)).email ?? undefined;
      } catch {
        // Ignore — see above.
      }
    }

    const rows = await listCollection(`apps/${params.appId}/collaborators`, idToken);
    return NextResponse.json({
      ownerUid,
      ownerEmail,
      collaborators: rows.map((r) => ({
        uid: r.id,
        email: r.fields.email as string,
        // A role-less doc predates this feature — same back-compat default
        // as lib/app-collaborators.ts's hasEditAccess and firestore.rules'
        // isAppEditor: treat it as "editor", not as broken/unknown.
        role: isCollaboratorRole(r.fields.role) ? r.fields.role : "editor",
        addedAt: r.fields.addedAt,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't load collaborators.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Owner-only: invites an existing Breezify user (by email) to work on this app. */
export async function POST(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { email, role: rawRole } = await req.json();
    const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!trimmedEmail) {
      return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
    }
    // Defaults to "editor" — the only behavior that existed before roles,
    // and the more likely intent when you're specifically inviting someone
    // to help build, vs. just show off progress (that's what "Viewer" is for).
    const role = rawRole === undefined ? "editor" : rawRole;
    if (!isCollaboratorRole(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const doc = await getDoc(`apps/${params.appId}`, idToken);
    if (!doc) return NextResponse.json({ error: "App not found." }, { status: 404 });
    if (doc.fields.userId !== uid) {
      return NextResponse.json({ error: "Only this app's owner can invite collaborators." }, { status: 403 });
    }

    const userDoc = await getDoc(`users/${uid}`, idToken);
    const plan = (userDoc?.fields.plan as PlanId) ?? "free";
    if (PLAN_RANK[plan] < PLAN_RANK[COLLABORATOR_MIN_PLAN]) {
      return NextResponse.json(
        { error: `Collaborators are available on the ${PLANS[COLLABORATOR_MIN_PLAN].name} plan and above.` },
        { status: 403 }
      );
    }

    const limit = MAX_COLLABORATORS[plan];

    if (!isFirebaseAdminConfigured()) {
      return NextResponse.json(
        { error: "Inviting collaborators isn't configured on this deployment yet." },
        { status: 400 }
      );
    }
    let invitedUid: string;
    try {
      invitedUid = (await adminAuth().getUserByEmail(trimmedEmail)).uid;
    } catch (err) {
      // adminAuth().getUserByEmail() throws its own "user-not-found" error
      // for a genuine miss, distinguishable from a real Firebase Admin API
      // failure (network, permissions) — the isFirebaseAdminConfigured()
      // check above already rules out the "no service account at all" case,
      // this narrows the remaining ambiguity so a transient Admin API error
      // isn't misreported as "that email has no account" to the inviter.
      const code = (err as { code?: string } | undefined)?.code;
      if (code && code !== "auth/user-not-found") {
        console.error(`[collaborators] getUserByEmail failed for a reason other than not-found:`, err);
        return NextResponse.json({ error: "Couldn't look up that email right now. Please try again." }, { status: 500 });
      }
      return NextResponse.json({ error: "No Breezify account found with that email." }, { status: 404 });
    }
    if (invitedUid === uid) {
      return NextResponse.json({ error: "You already own this app." }, { status: 400 });
    }

    // The cap check and the duplicate-invite check used to be a plain read
    // (listCollection) followed later by a separate write — two concurrent
    // invites (a double-click, two tabs) could both read the same
    // under-the-cap count and both pass, landing one over MAX_COLLABORATORS
    // with nothing anywhere (not firestore.rules either — its `allow
    // create` only checks ownership/role, never a count) to actually stop
    // it; the same stale read let two concurrent invites of the same
    // not-yet-collaborator email both pass the "already a collaborator"
    // check and both send an invite email. Wrapping the recheck and the
    // create in one Admin SDK transaction makes both checks atomic against
    // the actual write, closing both races — whichever request's
    // transaction commits first wins, and the loser gets a real "already a
    // collaborator" or "at your cap" error instead of silently succeeding
    // over the limit.
    const collabCollection = adminDb().collection(`apps/${params.appId}/collaborators`);
    const invitedRef = collabCollection.doc(invitedUid);
    try {
      await adminDb().runTransaction(async (tx) => {
        const [countSnap, invitedSnap] = await Promise.all([tx.get(collabCollection), tx.get(invitedRef)]);
        if (invitedSnap.exists) {
          throw new Error("ALREADY_COLLABORATOR");
        }
        if (countSnap.size >= limit) {
          throw new Error("OVER_LIMIT");
        }
        tx.set(invitedRef, {
          // Duplicated from the doc ID on purpose: a collectionGroup query
          // can't filter by documentId() equality with a bare uid (Firestore
          // requires a full document path there — a 1-segment value throws
          // "invalid document path" at query time), so
          // useCollaboratingApps() filters on this field instead.
          uid: invitedUid,
          email: trimmedEmail,
          role,
          addedBy: uid,
          addedAt: new Date(),
        });
      });
    } catch (err) {
      if (err instanceof Error && err.message === "ALREADY_COLLABORATOR") {
        return NextResponse.json({ error: "They're already a collaborator." }, { status: 409 });
      }
      if (err instanceof Error && err.message === "OVER_LIMIT") {
        return NextResponse.json(
          { error: `The ${PLANS[plan].name} plan allows up to ${limit} collaborators per app.` },
          { status: 403 }
        );
      }
      throw err;
    }

    // Best-effort, never blocks the invite itself: RESEND_API_KEY may not
    // be configured on this deployment (see lib/email.ts, a no-op in that
    // case), and even a real send failure shouldn't undo an invite that
    // already succeeded — the person still shows up on the roster and in
    // their own "shared with me" list either way.
    //
    // Respects the invitee's own "email me when invited to collaborate"
    // preference (Settings page, see lib/preferences default true) — read
    // via the Admin SDK since the inviter's idToken has no access to
    // another user's profile, and defaults to sending if the check itself
    // fails, matching the always-send behavior before this preference
    // existed.
    let wantsEmail = true;
    if (isFirebaseAdminConfigured()) {
      try {
        const invitedProfile = await adminDb().collection("users").doc(invitedUid).get();
        wantsEmail = invitedProfile.data()?.emailNotifications !== false;
      } catch {
        // Default to sending — see above.
      }
    }
    if (wantsEmail) {
      try {
        await sendCollaboratorInviteEmail({
          to: trimmedEmail,
          appName: (doc.fields.name as string) || "an app",
          appId: params.appId,
          appUrl: getAppBaseUrl(req.nextUrl.origin),
        });
      } catch (err) {
        console.error(`[collaborators] appId=${params.appId} failed to send invite email to ${trimmedEmail}:`, err);
      }
    }

    return NextResponse.json({ uid: invitedUid, email: trimmedEmail, role });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't add that collaborator.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** The owner can remove anyone; a collaborator can only remove themself (leave). */
export async function DELETE(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { uid: targetUid } = await req.json();
    if (!targetUid || typeof targetUid !== "string") {
      return NextResponse.json({ error: "Missing collaborator." }, { status: 400 });
    }

    const doc = await getDoc(`apps/${params.appId}`, idToken);
    if (!doc) return NextResponse.json({ error: "App not found." }, { status: 404 });
    if (doc.fields.userId !== uid && targetUid !== uid) {
      return NextResponse.json({ error: "You can only remove yourself." }, { status: 403 });
    }

    await commit([deleteWrite(`apps/${params.appId}/collaborators/${targetUid}`)], idToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't remove that collaborator.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Owner-only: changes an existing collaborator's role (editor <-> viewer). */
export async function PATCH(req: NextRequest, { params }: { params: { appId: string } }) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const { uid: targetUid, role } = await req.json();
    if (!targetUid || typeof targetUid !== "string") {
      return NextResponse.json({ error: "Missing collaborator." }, { status: 400 });
    }
    if (!isCollaboratorRole(role)) {
      return NextResponse.json({ error: "Invalid role." }, { status: 400 });
    }

    const doc = await getDoc(`apps/${params.appId}`, idToken);
    if (!doc) return NextResponse.json({ error: "App not found." }, { status: 404 });
    if (doc.fields.userId !== uid) {
      return NextResponse.json({ error: "Only this app's owner can change a collaborator's role." }, { status: 403 });
    }

    // Without this, a role change submitted against a collaborator who was
    // concurrently removed (another tab, or they left) falls straight
    // through to updateWrite, which firestore.rules rejects for a
    // nonexistent doc (`resource` is null) — that surfaced as a generic
    // 500 "Couldn't change that collaborator's role" with no indication of
    // what actually went wrong.
    const targetDoc = await getDoc(`apps/${params.appId}/collaborators/${targetUid}`, idToken);
    if (!targetDoc) {
      return NextResponse.json({ error: "That person is no longer a collaborator on this app." }, { status: 404 });
    }

    await commit(
      [updateWrite(`apps/${params.appId}/collaborators/${targetUid}`, { role }, ["role"])],
      idToken
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't change that collaborator's role.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
