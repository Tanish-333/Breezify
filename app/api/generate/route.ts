import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc, incrementWrite, updateWrite } from "@/lib/firestore-rest";
import { generateApp, isModelAvailable, refineApp } from "@/lib/generation";
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

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

/** Terminates the stream with a single error event rather than an HTTP status. */
function errorStream(message: string) {
  return new Response(sse({ type: "error", error: message }), {
    status: 200,
    headers: SSE_HEADERS,
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
  // When present, this is a follow-up change to an existing app rather than a
  // brand new build.
  const refineAppId = typeof body?.appId === "string" ? body.appId : null;
  // A user-supplied provider key. Used for this request only; never logged or
  // persisted. When present the user pays their provider directly, so we skip
  // both plan gating and credit deduction.
  const overrideKey =
    typeof body?.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : undefined;

  if (!prompt || prompt.length < 5) {
    return errorStream(
      refineAppId
        ? "Describe the change you want in a bit more detail."
        : "Please describe the app you want to build in a bit more detail."
    );
  }
  if (!isModelId(model)) return errorStream("Invalid model selection.");
  if (!overrideKey && !isModelAvailable(model)) {
    return errorStream(
      `${MODEL_INFO[model].label} isn't available on this deployment yet. Add your own API key in Settings, or pick another model.`
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
  if (!overrideKey && !planAllowsModel(plan, model)) {
    const needed = requiredPlanFor(model);
    return errorStream(
      `${MODEL_INFO[model].label} is available on the ${needed.name} plan. You're on ${PLANS[plan]?.name ?? "Free"}. You can also use your own API key.`
    );
  }

  // Own key means own bill, so nothing is charged here.
  const cost = overrideKey ? 0 : MODEL_INFO[model].credits;
  const currentCredits =
    typeof userDoc.fields.credits === "number" ? userDoc.fields.credits : 0;
  if (!overrideKey && currentCredits < cost) {
    return errorStream("Not enough credits. Top up your balance to keep building.");
  }

  // For a refine, load the existing app up front so ownership and file
  // availability fail fast, before any credits are involved.
  let existing: {
    prompt: string;
    files: Record<string, string>;
    createdAt: unknown;
    turns: unknown[];
  } | null = null;
  if (refineAppId) {
    let doc;
    try {
      doc = await getDoc(`apps/${refineAppId}`, idToken);
    } catch {
      return errorStream("Couldn't load that app. Please try again.");
    }
    if (!doc) return errorStream("App not found.");
    if (doc.fields.userId !== uid) return errorStream("You don't have access to this app.");
    const files =
      (doc.fields.generatedCode as { files?: Record<string, string> } | undefined)?.files ?? {};
    if (Object.keys(files).length === 0) {
      return errorStream("This app has no files to refine yet.");
    }
    existing = {
      prompt: (doc.fields.prompt as string) ?? "",
      files,
      createdAt: doc.fields.createdAt,
      turns: Array.isArray(doc.fields.turns) ? doc.fields.turns : [],
    };
  }

  const appId = refineAppId ?? randomUUID();
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
        if (existing) {
          send({ type: "status", message: "Reading your current files" });
        } else {
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
        }

        send({
          type: "status",
          message: `${existing ? "Updating" : "Generating"} with ${MODEL_INFO[model].label}`,
        });

        let lastEmit = 0;
        const onProgress = ({ chars, files }: { chars: number; files: string[] }) => {
          // Throttle so a fast stream doesn't flood the client.
          const now = Date.now();
          if (now - lastEmit < 120) return;
          lastEmit = now;
          send({ type: "progress", chars, files });
        };

        const result = existing
          ? await refineApp(existing.prompt, existing.files, prompt, model, onProgress, overrideKey)
          : await generateApp(prompt, model, onProgress, overrideKey);

        send({ type: "status", message: "Saving your app" });

        const turn = {
          id: randomUUID(),
          kind: existing ? "refine" : "build",
          instruction: prompt,
          summary: result.summary,
          model,
          fileCount: Object.keys(result.files).length,
          createdAt: new Date(),
        };

        const txId = randomUUID();
        await commit(
          [
            updateWrite(appPath, {
              userId: uid,
              name: result.appName,
              // A refine keeps the original brief; the instruction is not the prompt.
              prompt: existing ? existing.prompt : prompt,
              model,
              status: "ready",
              summary: result.summary,
              suggestions: result.suggestions,
              turns: [...(existing?.turns ?? []), turn],
              createdAt: existing ? (existing.createdAt as Date) ?? createdAt : createdAt,
              generatedCode: { files: result.files },
            }),
            ...(cost > 0 ? [incrementWrite(userPath, "credits", -cost)] : []),
            createWrite(`transactions/${txId}`, {
              userId: uid,
              type: "generation",
              creditsUsed: cost,
              model,
              // With a user-supplied key the spend lands on their provider
              // account, not ours, so there is no platform cost to track.
              actualCostUSD: overrideKey ? 0 : result.actualCostUSD,
              ownKey: Boolean(overrideKey),
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
        // Only a fresh build leaves a half-created doc behind; a failed refine
        // must leave the existing app untouched.
        if (!existing) {
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
        }
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
