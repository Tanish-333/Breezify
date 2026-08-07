import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminDb, isFirebaseAdminConfigured } from "@/lib/firebase-admin";
import { generateApp } from "@/lib/generation";
import { TEMPLATES } from "@/lib/templates";

export const runtime = "nodejs";
export const maxDuration = 300;

const SEED_MODEL = "sonnet" as const;

/**
 * One-time (well — safely re-runnable) admin operation: builds the real
 * seed apps the Templates section duplicates from (components/
 * templates-section.tsx), each one generated through the actual pipeline
 * (lib/generation), never hand-written generatedCode. Owned by
 * TEMPLATE_ACCOUNT_UID — a real Firebase Auth user the operator creates and
 * controls, same as any other Breezify account, just not one anyone signs
 * into day-to-day. Uses the Admin SDK (bypasses firestore.rules) because
 * there's no end-user ID token in an admin request like this one; the
 * resulting docs are ordinary apps/{appId} documents afterward, gated by
 * the same rules as any other app once written (see firestore.rules'
 * isTemplate branch for the one exception: readable by any signed-in user,
 * not just the owner).
 *
 * Not wired into any UI — call it directly:
 *   curl -X POST https://<your-domain>/api/admin/seed-templates \
 *     -H "Authorization: Bearer $ADMIN_SEED_SECRET"
 *
 * Safe to re-run after adding a new template to lib/templates.ts: any slug
 * that already has a matching apps/{appId} doc is skipped rather than
 * regenerated (and re-spending credits/API cost on unchanged templates).
 * Delete that app first (or change its templateSlug) to force a rebuild.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!process.env.ADMIN_SEED_SECRET || secret !== process.env.ADMIN_SEED_SECRET) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isFirebaseAdminConfigured()) {
    return NextResponse.json({ error: "FIREBASE_SERVICE_ACCOUNT isn't configured." }, { status: 500 });
  }
  const templateAccountUid = process.env.TEMPLATE_ACCOUNT_UID;
  if (!templateAccountUid) {
    return NextResponse.json({ error: "TEMPLATE_ACCOUNT_UID isn't configured." }, { status: 500 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't configured." }, { status: 500 });
  }

  const db = adminDb();
  const results: Record<string, { appId: string; skipped?: true } | { error: string }> = {};

  for (const template of TEMPLATES) {
    try {
      const existing = await db
        .collection("apps")
        .where("templateSlug", "==", template.id)
        .limit(1)
        .get();
      if (!existing.empty) {
        results[template.id] = { appId: existing.docs[0].id, skipped: true };
        continue;
      }

      const appId = randomUUID();
      // "max" plan's token budget, regardless of what plan the template
      // account itself is on — a template is worth building with real
      // headroom, not the default budget.
      const result = await generateApp(template.prompt, appId, SEED_MODEL, "max");

      const turn = {
        id: randomUUID(),
        kind: "build",
        instruction: template.prompt,
        summary: result.summary,
        model: SEED_MODEL,
        fileCount: Object.keys(result.files).length,
        createdAt: new Date(),
      };

      await db
        .collection("apps")
        .doc(appId)
        .set({
          userId: templateAccountUid,
          name: result.appName,
          prompt: template.prompt,
          model: SEED_MODEL,
          status: "ready",
          summary: result.summary,
          suggestions: result.suggestions,
          turns: [turn],
          generatedCode: { files: result.files },
          isTemplate: true,
          templateSlug: template.id,
          createdAt: new Date(),
          visits: 0,
        });
      await db.collection("apps").doc(appId).collection("versions").doc(turn.id).set({
        userId: templateAccountUid,
        files: result.files,
        createdAt: new Date(),
      });

      results[template.id] = { appId };
    } catch (err) {
      console.error(`[seed-templates] slug=${template.id} failed:`, err);
      results[template.id] = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  return NextResponse.json({ results });
}
