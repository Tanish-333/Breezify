import { NextResponse } from "next/server";
import { isModelAvailable } from "@/lib/generation";
import { MODEL_IDS } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reports which models have a provider API key configured, so the build page
 * can distinguish "locked, upgrade your plan" from "not wired up on this
 * deployment yet". Returns no key material, only booleans.
 */
export async function GET() {
  const available: Record<string, boolean> = {};
  for (const id of MODEL_IDS) {
    available[id] = isModelAvailable(id);
  }
  return NextResponse.json({ available });
}
