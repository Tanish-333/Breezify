import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc } from "@/lib/firestore-rest";
import { hasAppAccess } from "@/lib/app-collaborators";
import { DUPLICATE_MIN_PLAN, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Copies an app's prompt, model, and generated files into a brand new app
 * the caller owns, with a clean history (no turns, no deploy/GitHub links
 * carried over). No AI call involved, so it's free to offer as a plan perk —
 * but "free to run" isn't "free to gate": this used to be a plain client-side
 * Firestore write (see the removed duplicateApp() in lib/use-apps.ts), whose
 * only Pro+ check lived in the UI button. firestore.rules' apps/{appId}
 * create rule only ever checked ownership, not plan, so anyone signed in
 * could call the client SDK directly and duplicate any app they can already
 * read for free. Routed through here instead, the same way every other
 * paywalled action in this app is — checked server-side, not just hidden in
 * the UI.
 */
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
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    const { appId } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }

    const userDoc = await getDoc(`users/${uid}`, idToken);
    const plan = (userDoc?.fields.plan as PlanId) ?? "free";
    if (PLAN_RANK[plan] < PLAN_RANK[DUPLICATE_MIN_PLAN]) {
      return NextResponse.json(
        { error: `Duplicating an app is available on the ${PLANS[DUPLICATE_MIN_PLAN].name} plan and above.` },
        { status: 403 }
      );
    }

    // getDoc is itself rules-gated to the owner or an existing collaborator,
    // so a caller unrelated to this app is rejected right here regardless.
    const doc = await getDoc(`apps/${appId}`, idToken);
    if (!doc) return NextResponse.json({ error: "App not found." }, { status: 404 });
    if (!(await hasAppAccess(appId, doc.fields.userId as string, uid, idToken))) {
      return NextResponse.json({ error: "You don't have access to this app." }, { status: 403 });
    }

    const newAppId = crypto.randomUUID();
    await commit(
      [
        createWrite(`apps/${newAppId}`, {
          userId: uid,
          name: `${(doc.fields.name as string) || "Untitled"} (copy)`,
          prompt: doc.fields.prompt ?? "",
          model: doc.fields.model ?? "haiku",
          status: "ready",
          summary: doc.fields.summary ?? "",
          suggestions: [],
          turns: [],
          generatedCode: doc.fields.generatedCode ?? { files: {} },
          createdAt: new Date(),
          visits: 0,
        }),
      ],
      idToken
    );

    return NextResponse.json({ appId: newAppId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't duplicate this app.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
