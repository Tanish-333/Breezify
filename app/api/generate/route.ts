import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc, incrementWrite, updateWrite } from "@/lib/firestore-rest";
import { generateApp, isModelAvailable, refineApp } from "@/lib/generation";
import { checkClarity } from "@/lib/generation/clarify";
import {
  MODEL_INFO,
  PLANS,
  PROMPT_CHAR_LIMIT,
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
  | { type: "clarify"; question: string; options: string[] }
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
  let emailVerified: boolean;
  try {
    const verified = await verifyIdToken(idToken);
    uid = verified.uid;
    emailVerified = verified.emailVerified;
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
  // Set once the client has already answered a clarifying question, so the
  // clarity check below only ever runs once per build.
  const clarified = body?.clarified === true;

  // Unverified accounts cost nothing to create, so they're the cheapest way
  // to farm free signup credit against our own key.
  if (!emailVerified) {
    return errorStream("Please verify your email before generating apps. Check your inbox for the link.");
  }

  if (!prompt || prompt.length < 5) {
    return errorStream(
      refineAppId
        ? "Describe the change you want in a bit more detail."
        : "Please describe the app you want to build in a bit more detail."
    );
  }
  if (!isModelId(model)) return errorStream("Invalid model selection.");
  if (!isModelAvailable(model)) {
    return errorStream(`${MODEL_INFO[model].label} isn't available on this deployment yet.`);
  }

  const userPath = `users/${uid}`;
  let userDoc;
  try {
    userDoc = await getDoc(userPath, idToken);
  } catch (err) {
    console.error(`[generate] Failed to load ${userPath}:`, err);
    return errorStream("Couldn't load your account. Please try again.");
  }
  if (!userDoc) return errorStream("User account not found.");

  const plan = (userDoc.fields.plan as PlanId) ?? "free";

  // Caps how much text (including any attached file context the client
  // appended) can be sent per request. Scales with plan so a free account
  // can't submit a huge prompt against the platform's own key.
  const charLimit = PROMPT_CHAR_LIMIT[plan];
  if (prompt.length > charLimit) {
    return errorStream(
      `${PLANS[plan]?.name ?? "Free"} plan prompts are limited to ${charLimit.toLocaleString()} characters (this one is ${prompt.length.toLocaleString()}). Upgrade for a higher limit, or trim it down.`
    );
  }

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
    } catch (err) {
      console.error(`[generate] Failed to load apps/${refineAppId}:`, err);
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
        if (!existing && !clarified) {
          send({ type: "status", message: "Reviewing your request" });
          const clarity = await checkClarity(prompt);
          // Don't charge for a question nobody is around to answer.
          if (req.signal.aborted) return;
          if (clarity.needsClarification) {
            // Charge a small flat fee for asking rather than the full model
            // cost, since no generation actually ran. 0.5 is always covered:
            // the credits check above already required currentCredits >= cost,
            // and every model's cost is >= 0.5.
            const clarifyTxId = randomUUID();
            await commit(
              [
                incrementWrite(userPath, "credits", -0.5),
                createWrite(`transactions/${clarifyTxId}`, {
                  userId: uid,
                  type: "generation",
                  creditsUsed: 0.5,
                  createdAt: new Date(),
                }),
              ],
              idToken
            );
            send({ type: "clarify", question: clarity.question, options: clarity.options });
            return;
          }
        }

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
                visits: 0,
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
          ? await refineApp(existing.prompt, existing.files, prompt, model, plan, onProgress, req.signal)
          : await generateApp(prompt, model, plan, onProgress, req.signal);

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
            incrementWrite(userPath, "credits", -cost),
            createWrite(`transactions/${txId}`, {
              userId: uid,
              type: "generation",
              creditsUsed: cost,
              model,
              actualCostUSD: result.actualCostUSD,
              createdAt: new Date(),
            }),
            // A snapshot of this turn's files, so it can be reverted to later.
            createWrite(`${appPath}/versions/${turn.id}`, {
              files: result.files,
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
        // req.signal aborts when the client disconnects (including an
        // explicit Cancel click, since that aborts the client's fetch).
        // The generation call is threaded with this same signal, so it
        // stops immediately rather than running to completion and
        // charging credits for a result nobody will see.
        if (req.signal.aborted) {
          if (!existing) {
            try {
              await commit(
                [updateWrite(appPath, { userId: uid, name: prompt.slice(0, 60), prompt, model, status: "stopped", createdAt }, ["userId", "name", "prompt", "model", "status", "createdAt"])],
                idToken
              );
            } catch {
              // Client is long gone either way; nothing to surface this to.
            }
          }
          return;
        }

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
