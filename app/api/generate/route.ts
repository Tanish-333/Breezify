import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc, incrementWrite, updateWrite } from "@/lib/firestore-rest";
import { generateApp } from "@/lib/anthropic";
import { MODEL_INFO, type ModelId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function isModelId(v: unknown): v is ModelId {
  return v === "haiku" || v === "sonnet" || v === "opus";
}

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
      return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
    }

    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = body.model;

    if (!prompt || prompt.length < 5) {
      return NextResponse.json({ error: "Please describe the app you want to build." }, { status: 400 });
    }
    if (!isModelId(model)) {
      return NextResponse.json({ error: "Invalid model selection." }, { status: 400 });
    }

    const userPath = `users/${uid}`;
    const userDoc = await getDoc(userPath, idToken);
    if (!userDoc) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }

    const cost = MODEL_INFO[model].credits;
    const currentCredits = typeof userDoc.fields.credits === "number" ? userDoc.fields.credits : 0;
    if (currentCredits < cost) {
      return NextResponse.json(
        { error: "Not enough credits. Top up your balance to keep building." },
        { status: 402 }
      );
    }

    const appId = randomUUID();
    const appPath = `apps/${appId}`;
    await commit(
      [
        createWrite(appPath, {
          userId: uid,
          name: prompt.slice(0, 60),
          prompt,
          model,
          status: "generating",
          createdAt: new Date().toISOString(),
        }),
      ],
      idToken
    );

    try {
      const result = await generateApp(prompt, model);

      const txId = randomUUID();
      await commit(
        [
          updateWrite(appPath, {
            userId: uid,
            name: result.appName,
            prompt,
            model,
            status: "ready",
            createdAt: userDoc.fields.createdAt ?? new Date().toISOString(),
            generatedCode: { files: result.files },
          }),
          incrementWrite(userPath, "credits", -cost),
          createWrite(`transactions/${txId}`, {
            userId: uid,
            type: "generation",
            creditsUsed: cost,
            model,
            actualCostUSD: result.actualCostUSD,
            createdAt: new Date().toISOString(),
          }),
        ],
        idToken
      );

      return NextResponse.json({
        appId,
        appName: result.appName,
        summary: result.summary,
        files: result.files,
      });
    } catch (genErr) {
      const message = genErr instanceof Error ? genErr.message : "Generation failed.";
      await commit(
        [
          updateWrite(appPath, {
            userId: uid,
            name: prompt.slice(0, 60),
            prompt,
            model,
            status: "error",
            createdAt: new Date().toISOString(),
            errorMessage: message,
          }),
        ],
        idToken
      );
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
