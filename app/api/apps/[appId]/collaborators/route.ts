import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { adminAuth } from "@/lib/firebase-admin";
import { commit, createWrite, deleteWrite, getDoc, listCollection } from "@/lib/firestore-rest";
import { COLLABORATOR_MIN_PLAN, MAX_COLLABORATORS, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";

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

    const rows = await listCollection(`apps/${params.appId}/collaborators`, idToken);
    return NextResponse.json({
      ownerUid: doc.fields.userId,
      collaborators: rows.map((r) => ({
        uid: r.id,
        email: r.fields.email as string,
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

    const { email } = await req.json();
    const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!trimmedEmail) {
      return NextResponse.json({ error: "Enter an email address." }, { status: 400 });
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

    const existing = await listCollection(`apps/${params.appId}/collaborators`, idToken);
    const limit = MAX_COLLABORATORS[plan];
    if (existing.length >= limit) {
      return NextResponse.json(
        { error: `The ${PLANS[plan].name} plan allows up to ${limit} collaborators per app.` },
        { status: 403 }
      );
    }

    let invitedUid: string;
    try {
      invitedUid = (await adminAuth().getUserByEmail(trimmedEmail)).uid;
    } catch {
      return NextResponse.json({ error: "No Breezify account found with that email." }, { status: 404 });
    }
    if (invitedUid === uid) {
      return NextResponse.json({ error: "You already own this app." }, { status: 400 });
    }
    if (existing.some((r) => r.id === invitedUid)) {
      return NextResponse.json({ error: "They're already a collaborator." }, { status: 409 });
    }

    await commit(
      [
        createWrite(`apps/${params.appId}/collaborators/${invitedUid}`, {
          email: trimmedEmail,
          addedBy: uid,
          addedAt: new Date(),
        }),
      ],
      idToken
    );

    return NextResponse.json({ uid: invitedUid, email: trimmedEmail });
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
