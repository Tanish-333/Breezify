import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, getDoc, updateWrite } from "@/lib/firestore-rest";
import { withWatermark } from "@/lib/watermark";
import { deployToVercel, isDeployConfigured } from "@/lib/vercel-deploy";
import type { PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

function slugify(appId: string, name: string) {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "feather-app";
  return `${base}-${appId.slice(0, 6)}`;
}

export async function POST(req: NextRequest) {
  try {
    if (!isDeployConfigured()) {
      return NextResponse.json(
        { error: "Deploys aren't configured on this deployment yet. Set VERCEL_TOKEN." },
        { status: 400 }
      );
    }

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

    const appDoc = await getDoc(`apps/${appId}`, idToken);
    if (!appDoc) {
      return NextResponse.json({ error: "App not found." }, { status: 404 });
    }
    if (appDoc.fields.userId !== uid) {
      return NextResponse.json({ error: "You don't have access to this app." }, { status: 403 });
    }

    const generated = appDoc.fields.generatedCode as { files?: Record<string, string> } | undefined;
    const rawFiles = generated?.files ?? {};
    if (Object.keys(rawFiles).length === 0) {
      return NextResponse.json({ error: "This app has no files to deploy." }, { status: 400 });
    }

    // Apps with a real backend need a running server; there's nothing to
    // statically deploy them to here (same limitation the live preview has).
    const hasServerOnly =
      !Object.keys(rawFiles).some((p) => /\.(tsx?|jsx?)$/.test(p) && p.startsWith("src/")) &&
      Object.keys(rawFiles).some((p) => /server|api|routes/i.test(p));
    if (hasServerOnly) {
      return NextResponse.json(
        { error: "This app needs a running server, so it can't be deployed as a static site." },
        { status: 400 }
      );
    }

    let userPlan: PlanId = "free";
    try {
      const userDoc = await getDoc(`users/${uid}`, idToken);
      userPlan = (userDoc?.fields.plan as PlanId) ?? "free";
    } catch {
      // Default to "free" (show the badge) rather than block the deploy.
    }

    const name = (appDoc.fields.name as string) || "feather-app";
    const slug = slugify(appId, name);
    const files = withWatermark(rawFiles, userPlan === "free");

    await commit([updateWrite(`apps/${appId}`, { status: "deploying" }, ["status"])], idToken);

    try {
      const result = await deployToVercel(slug, files);
      await commit(
        [
          updateWrite(
            `apps/${appId}`,
            { status: "live", deployedUrl: result.url, deployedAt: new Date() },
            ["status", "deployedUrl", "deployedAt"]
          ),
        ],
        idToken
      );
      return NextResponse.json({ url: result.url });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deploy failed.";
      await commit(
        [updateWrite(`apps/${appId}`, { status: "error", errorMessage: message }, ["status", "errorMessage"])],
        idToken
      ).catch(() => {});
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to deploy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
