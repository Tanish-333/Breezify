import { NextRequest, NextResponse } from "next/server";
import { authenticate } from "@/lib/domain-api";
import { deleteAllVercelProjects } from "@/lib/deploy-actions";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Bulk-undeploys every one of the caller's apps that's its own real Vercel
 * project and deletes that project on Vercel, in one call — a faster way
 * to reclaim Vercel project quota than undeploying apps one at a time from
 * the dashboard. The apps themselves, their code, and their history are
 * untouched; each can be redeployed any time, same as a single undeploy.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.error) return auth.error;
    const { uid, idToken } = auth;

    const result = await deleteAllVercelProjects({ uid, idToken });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't delete your Vercel projects.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
