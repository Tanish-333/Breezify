import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc, incrementWrite, updateWrite } from "@/lib/firestore-rest";
import { generateApp, isModelAvailable } from "@/lib/generation";
import {
  MODEL_INFO,
  PLANS,
  isModelId,
  planAllowsModel,
  requiredPlanFor,
  type PlanId,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type Event =
  | { type: "status"; message: string }
  | { type: "progress"; chars: number; files: string[] }
  | { type: "done"; appId: string; appName: string; summary: string; files: Record<string, string> }
  | { type: "error"; error: string };

function sse(event: Event) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Terminates the stream with a single error event rather than an HTTP status. */
function errorStream(message: string) {
  return new Response(sse({ type: "error", error: message }), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return errorStream("Missing authorization token.");

  let uid: string;
  try {
    uid = (await verifyIdToken(idToken)).uid;
  } catch {
    return errorStream("Your session has expired. Please sign in again.");
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorStream("Invalid request body.");
  }

  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  const model = body?.model;

  if (!prompt || prompt.length < 5) {
    return errorStream("Please describe the app you want to build in a bit more detail.");
  }
  if (!isModelId(model)) {
    return errorStream("Invalid model selection.");
  }
  if (!isModelAvailable(model)) {
    return errorStream(
      `${MODEL_INFO[model].label} isn't available on this deployment yet. Pick another model.`
    );
  }

  const userPath = `users/${uid}`;
  let userDoc;
  try {
    userDoc = await getDoc(userPath, idToken);
  } catch {
    return errorStream("Couldn't load your account. Please try again.");
  }
  if (!userDoc) return errorStream("User account not found.");

  const plan = (userDoc.fields.plan as PlanId) ?? "free";
  if (!planAllowsModel(plan, model)) {
    const needed = requiredPlanFor(model);
    return errorStream(
      `${MODEL_INFO[model].label} is available on the ${needed.name} plan. You're on ${PLANS[plan]?.name ?? "Free"}.`
    );
  }

  const cost = MODEL_INFO[model].credits;
  const currentCredits =
    typeof userDoc.fields.credits === "number" ? userDoc.fields.credits : 0;
  if (currentCredits < cost) {
    return errorStream("Not enough credits. Top up your balance to keep building.");
  }

  const appId = randomUUID();
  const appPath = `apps/${appId}`;
  const createdAt = new Date();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Event) => {
        try {
          controller.enqueue(encoder.encode(sse(event)));
        } catch {
          // Client disconnected; generation still completes and is persisted.
        }
      };

      try {
        send({ type: "status", message: "Setting up your app" });

        await commit(
          [
            createWrite(appPath, {
              userId: uid,
              name: prompt.slice(0, 60),
              prompt,
              model,
              status: "generating",
              createdAt,
            }),
          ],
          idToken
        );

        send({ type: "status", message: `Generating with ${MODEL_INFO[model].label}` });

        let lastEmit = 0;
        const result = await generateApp(prompt, model, ({ chars, files }) => {
          // Throttle so a fast stream doesn't flood the client.
          const now = Date.now();
          if (now - lastEmit < 120) return;
          lastEmit = now;
          send({ type: "progress", chars, files });
        });

        send({ type: "status", message: "Saving your app" });

        const txId = randomUUID();
        await commit(
          [
            updateWrite(appPath, {
              userId: uid,
              name: result.appName,
              prompt,
              model,
              status: "ready",
              summary: result.summary,
              createdAt,
              generatedCode: { files: result.files },
            }),
            incrementWrite(userPath, "credits", -cost),
            createWrite(`transactions/${txId}`, {
              userId: uid,
              type: "generation",
              creditsUsed: cost,
              model,
              actualCostUSD: result.actualCostUSD,
              createdAt: new Date(),
            }),
          ],
          idToken
        );

        send({
          type: "done",
          appId,
          appName: result.appName,
          summary: result.summary,
          files: result.files,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Generation failed. Please try again.";
        // Best effort: mark the app errored so it doesn't sit in "generating".
        try {
          await commit(
            [
              updateWrite(appPath, {
                userId: uid,
                name: prompt.slice(0, 60),
                prompt,
                model,
                status: "error",
                createdAt,
                errorMessage: message,
              }),
            ],
            idToken
          );
        } catch {
          // Ignore, the error event below is what the user sees.
        }
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
