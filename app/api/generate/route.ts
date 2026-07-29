import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase-admin";
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
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    const decoded = await adminAuth().verifyIdToken(token);
    const uid = decoded.uid;

    const body = await req.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const model = body.model;

    if (!prompt || prompt.length < 5) {
      return NextResponse.json({ error: "Please describe the app you want to build." }, { status: 400 });
    }
    if (!isModelId(model)) {
      return NextResponse.json({ error: "Invalid model selection." }, { status: 400 });
    }

    const db = adminDb();
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: "User account not found." }, { status: 404 });
    }

    const cost = MODEL_INFO[model].credits;
    const currentCredits = (userSnap.data()?.credits as number) ?? 0;
    if (currentCredits < cost) {
      return NextResponse.json(
        { error: "Not enough credits. Top up your balance to keep building." },
        { status: 402 }
      );
    }

    const appRef = db.collection("apps").doc();
    await appRef.set({
      userId: uid,
      name: prompt.slice(0, 60),
      prompt,
      model,
      status: "generating",
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      const result = await generateApp(prompt, model);

      await appRef.update({
        name: result.appName,
        status: "ready",
        generatedCode: {
          files: result.files,
        },
      });

      await userRef.update({ credits: FieldValue.increment(-cost) });

      await db.collection("transactions").add({
        userId: uid,
        type: "generation",
        creditsUsed: cost,
        model,
        actualCostUSD: result.actualCostUSD,
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        appId: appRef.id,
        appName: result.appName,
        summary: result.summary,
        files: result.files,
      });
    } catch (genErr) {
      const message = genErr instanceof Error ? genErr.message : "Generation failed.";
      await appRef.update({ status: "error", errorMessage: message });
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
