import { NextRequest, NextResponse } from "next/server";
import { TEMPLATE_APP_FILES } from "@/lib/template-apps";

export const runtime = "nodejs";

/**
 * Read-only preview data for a single template — just its static file
 * bundle, so components/templates-section.tsx can render it in AppPreview
 * before anyone commits to duplicating it. No auth: template source is the
 * same for every viewer regardless of plan (the Pro+ gate is on actually
 * duplicating it, enforced server-side in app/api/apps/from-template, not
 * on looking at it first).
 */
export async function GET(_req: NextRequest, { params }: { params: { templateId: string } }) {
  const files = TEMPLATE_APP_FILES[params.templateId];
  if (!files) {
    return NextResponse.json({ error: "Unknown template." }, { status: 404 });
  }
  return NextResponse.json({ files });
}
