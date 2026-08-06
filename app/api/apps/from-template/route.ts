import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc } from "@/lib/firestore-rest";
import { DUPLICATE_MIN_PLAN, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";
import { TEMPLATES } from "@/lib/templates";
import { TEMPLATE_APP_FILES } from "@/lib/template-apps";

export const runtime = "nodejs";

/**
 * Creates a brand new app the caller owns from one of the hand-written
 * templates in lib/template-apps/ — no AI call, no admin secret, no
 * seeded Firestore doc to copy from (contrast app/api/apps/duplicate,
 * which copies an existing app doc). Each template's file bundle is a
 * complete, static Vite+React+TypeScript+Tailwind app shipped in this
 * repo, so this route is free to run and needs nothing configured beyond
 * the same Pro+ plan check every other duplicate-flavored action here
 * already uses.
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

    const { templateId } = await req.json();
    if (!templateId || typeof templateId !== "string") {
      return NextResponse.json({ error: "Missing template." }, { status: 400 });
    }

    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }
    const files = TEMPLATE_APP_FILES[templateId];
    if (!files) {
      return NextResponse.json({ error: "Template not found." }, { status: 404 });
    }

    const userDoc = await getDoc(`users/${uid}`, idToken);
    const plan = (userDoc?.fields.plan as PlanId) ?? "free";
    if (PLAN_RANK[plan] < PLAN_RANK[DUPLICATE_MIN_PLAN]) {
      return NextResponse.json(
        { error: `Using a template is available on the ${PLANS[DUPLICATE_MIN_PLAN].name} plan and above.` },
        { status: 403 }
      );
    }

    const newAppId = crypto.randomUUID();
    await commit(
      [
        createWrite(`apps/${newAppId}`, {
          userId: uid,
          name: template.title,
          prompt: template.prompt,
          model: "haiku",
          status: "ready",
          summary: template.description,
          suggestions: [],
          turns: [],
          generatedCode: { files },
          createdAt: new Date(),
          visits: 0,
        }),
      ],
      idToken
    );

    return NextResponse.json({ appId: newAppId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't use this template.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
