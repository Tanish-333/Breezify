import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc, querySubcollection } from "@/lib/firestore-rest";
import { hasEditAccess } from "@/lib/app-collaborators";
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

    // getDoc is itself rules-gated to the owner, an existing collaborator,
    // or (see firestore.rules) any signed-in user reading a template app —
    // so a caller unrelated to a non-template app is rejected right here
    // regardless.
    const doc = await getDoc(`apps/${appId}`, idToken);
    if (!doc) return NextResponse.json({ error: "App not found." }, { status: 404 });
    const isTemplate = doc.fields.isTemplate === true;
    // A template is meant to be duplicated by anyone on the Pro+ plan
    // already checked above, not just its owner (the system template
    // account) or someone it's invited as a collaborator — nobody ever is.
    if (!isTemplate && !(await hasEditAccess(appId, doc.fields.userId as string, uid, idToken))) {
      return NextResponse.json({ error: "You have view-only access to this app — ask the owner to make you an editor to do this." }, { status: 403 });
    }

    const newAppId = crypto.randomUUID();
    // A separate commit from the secrets copy below, not the same batch:
    // secrets/{id}'s create rule does get(apps/{newAppId}).data.userId to
    // check ownership (see firestore.rules), and within one commit that
    // get() only ever sees pre-commit state — so if apps/{newAppId} were
    // created in the same batch, it would still look like it doesn't exist
    // yet and every secret write would be denied. Same reasoning as
    // app/api/github/import's two-commit app+versions write.
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

    // Secrets are deliberately owner-only everywhere else (a collaborator
    // never gets to read another owner's API keys — see
    // lib/app-collaborators.ts and the deploy route's own secrets check),
    // so only copy them when the OWNER is duplicating their own app, never
    // when a collaborator duplicates an app they don't own: that would leak
    // the real owner's key values into a new app the collaborator now
    // fully controls. Best-effort — a generated app with no backend has no
    // secrets to copy, and a failure here shouldn't undo the duplicate that
    // already succeeded.
    if (doc.fields.userId === uid) {
      try {
        // secrets/{id}'s read rule checks resource.data.userId (a field on
        // each document), not a get() on the parent — a plain "list
        // everything" call can't be proven safe by Firestore for a rule
        // shaped like that, and is rejected outright with
        // PERMISSION_DENIED regardless of actual ownership, silently
        // masked by the catch below. See querySubcollection's own doc
        // comment for the full mechanics. Filtering by this caller's own
        // uid (already confirmed as the owner just above) is what makes
        // the request provably safe.
        const secretDocs = await querySubcollection(`apps/${appId}`, "secrets", "userId", uid, idToken);
        const writes = secretDocs
          .filter((s) => typeof s.fields.key === "string" && typeof s.fields.value === "string")
          .map((s) =>
            createWrite(`apps/${newAppId}/secrets/${crypto.randomUUID()}`, {
              userId: uid,
              key: s.fields.key,
              value: s.fields.value,
              createdAt: new Date(),
            })
          );
        if (writes.length > 0) await commit(writes, idToken);
      } catch (err) {
        console.error(`[apps/duplicate] appId=${appId} newAppId=${newAppId} failed to copy secrets:`, err);
      }
    }

    return NextResponse.json({ appId: newAppId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't duplicate this app.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
