import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc, incrementWrite, updateWrite } from "@/lib/firestore-rest";
import { getOrCreateUserDoc } from "@/lib/ensure-user-doc-server";
import { hasAppAccess } from "@/lib/app-collaborators";
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

// A "generating" lock older than this is presumed crashed (the function
// timed out, the process was killed) rather than genuinely still running —
// past it, a new refine is allowed to reclaim the app rather than being
// blocked forever by a claim nobody will ever release. Comfortably above
// maxDuration so a real, still-running generation is never mistaken for a
// stale one.
const GENERATING_LOCK_STALE_MS = 6 * 60 * 1000;

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

/** getDoc() hands back a Firestore timestamp as an ISO string; turn it back into a real Date before writing it. */
function parseExistingCreatedAt(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Releases a refine's "generating" claim, restoring whatever status held before it — see the claim in the refineAppId branch below. */
async function releaseRefineLock(appId: string, previousStatus: string | undefined, idToken: string) {
  const restoreStatus = previousStatus && previousStatus !== "generating" ? previousStatus : "ready";
  await commit(
    [
      updateWrite(
        `apps/${appId}`,
        { status: restoreStatus, generatingBy: null, generatingByEmail: null, generatingStartedAt: null },
        ["status", "generatingBy", "generatingByEmail", "generatingStartedAt"]
      ),
    ],
    idToken
  );
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) return errorStream("Missing authorization token.");

  let uid: string;
  let email: string | undefined;
  let emailVerified: boolean;
  try {
    const verified = await verifyIdToken(idToken);
    uid = verified.uid;
    email = verified.email;
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
    userDoc = await getOrCreateUserDoc(uid, idToken, email);
  } catch (err) {
    console.error(`[generate] Failed to load ${userPath}:`, err);
    return errorStream("Couldn't load your account. Please try again.");
  }
  if (!userDoc) return errorStream("We couldn't find or set up your account. Please sign out and back in, then try again.");

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
    ownerUid: string;
    /** What `status` held before this refine claimed it — restored if this refine aborts or errors. */
    previousStatus: string | undefined;
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
    const ownerUid = doc.fields.userId as string;
    if (!(await hasAppAccess(refineAppId, ownerUid, uid, idToken))) {
      return errorStream("You don't have access to this app.");
    }
    const files =
      (doc.fields.generatedCode as { files?: Record<string, string> } | undefined)?.files ?? {};
    if (Object.keys(files).length === 0) {
      return errorStream("This app has no files to refine yet.");
    }

    // Claim this refine before anything else, so a collaborator who clicks
    // refine moments after another one already started doesn't silently
    // race them — without this, both would read the same base files, both
    // generate independently, and whichever's commit lands last would
    // overwrite the other's result outright (last-write-wins), including
    // burning that person's credits on a result nobody ever sees. Now
    // possible for the first time since apps/{appId} can have several
    // editors, not just its one owner.
    // This doesn't fully close the race (two nearly-simultaneous refines
    // can still both read the doc as free before either claims it), but it
    // shrinks the window from "the whole generation" down to a single
    // network round trip — the same tradeoff app/api/deploy/route.ts
    // already makes for its own daily-limit counter, for the same reason.
    const previousStatus = doc.fields.status as string | undefined;
    const lockStartedAtMs =
      typeof doc.fields.generatingStartedAt === "string" ? Date.parse(doc.fields.generatingStartedAt) : NaN;
    const lockIsStale = Number.isNaN(lockStartedAtMs) || Date.now() - lockStartedAtMs > GENERATING_LOCK_STALE_MS;
    if (previousStatus === "generating" && !lockIsStale) {
      return errorStream("Someone else is already refining this app right now. Wait for them to finish, then try again.");
    }
    try {
      await commit(
        [
          updateWrite(
            `apps/${refineAppId}`,
            { status: "generating", generatingBy: uid, generatingByEmail: email ?? null, generatingStartedAt: new Date() },
            ["status", "generatingBy", "generatingByEmail", "generatingStartedAt"]
          ),
        ],
        idToken
      );
    } catch (err) {
      console.error(`[generate] Failed to claim apps/${refineAppId} for refine:`, err);
      return errorStream("Couldn't start this refine. Please try again.");
    }

    existing = {
      ownerUid,
      previousStatus,
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
                generatingBy: uid,
                generatingByEmail: email ?? null,
                generatingStartedAt: new Date(),
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
          ? await refineApp(
              existing.prompt,
              existing.files,
              prompt,
              appId,
              model,
              plan,
              onProgress,
              req.signal
            )
          : await generateApp(prompt, appId, model, plan, onProgress, req.signal);

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
              // A refine must never move ownership of the app to whichever
              // collaborator happened to run it — firestore.rules rejects an
              // apps/{appId} update that changes userId, so writing the
              // caller's uid here didn't just mis-attribute ownership, it
              // made every refine done by a collaborator fail outright.
              userId: existing ? existing.ownerUid : uid,
              name: result.appName,
              // A refine keeps the original brief; the instruction is not the prompt.
              prompt: existing ? existing.prompt : prompt,
              model,
              status: "ready",
              generatingBy: null,
              generatingByEmail: null,
              generatingStartedAt: null,
              summary: result.summary,
              suggestions: result.suggestions,
              turns: [...(existing?.turns ?? []), turn],
              // getDoc() returns a Firestore timestamp as a plain ISO
              // string (see fromFirestoreValue in lib/firestore-rest.ts),
              // not a real Date — writing that string straight back would
              // silently store it as stringValue instead of timestampValue,
              // and Firestore sorts all timestamps before all strings, so
              // orderBy("createdAt", "desc") on the dashboard would then
              // pin this app above every genuinely newer one forever.
              createdAt: existing ? parseExistingCreatedAt(existing.createdAt) ?? createdAt : createdAt,
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
              userId: uid,
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
        // The generation call is threaded with this same signal, so the
        // provider call itself stops quickly rather than running to
        // completion for a result nobody will see — but reaching this
        // catch at all means generateApp()/refineApp() was already invoked
        // (the earlier, genuinely free clarify-question abort returns
        // before this try/catch is ever at risk of throwing), so real
        // provider cost was likely already incurred by the time the abort
        // landed. Charging nothing here — the previous behavior — let
        // anyone burn real API spend for free by simply closing the tab
        // mid-generation. Charges the same 0.5 floor as an abandoned
        // clarify question instead: less than every model's real cost, but
        // no longer zero.
        if (req.signal.aborted) {
          const abortTxId = randomUUID();
          try {
            await commit(
              [
                incrementWrite(userPath, "credits", -0.5),
                createWrite(`transactions/${abortTxId}`, {
                  userId: uid,
                  type: "generation",
                  creditsUsed: 0.5,
                  model,
                  createdAt: new Date(),
                }),
              ],
              idToken
            );
          } catch {
            // Client is long gone either way; nothing to surface this to.
          }
          if (!existing) {
            try {
              await commit(
                [updateWrite(appPath, { userId: uid, name: prompt.slice(0, 60), prompt, model, status: "stopped", createdAt }, ["userId", "name", "prompt", "model", "status", "createdAt"])],
                idToken
              );
            } catch {
              // Client is long gone either way; nothing to surface this to.
            }
          } else {
            // Release the refine lock claimed above — otherwise an aborted
            // refine would leave the app stuck showing "generating" (and
            // blocking every other collaborator's refine) until the stale-
            // lock timeout, instead of just... going back to how it was.
            try {
              await releaseRefineLock(refineAppId!, existing.previousStatus, idToken);
            } catch {
              // Client is long gone either way; nothing to surface this to.
            }
          }
          return;
        }

        const message =
          err instanceof Error ? err.message : "Generation failed. Please try again.";
        // Previously unlogged: a commit() failure here (e.g. a Firestore
        // rules rejection) only ever reached the client as a generic error
        // event, with nothing server-side to diagnose it from afterward.
        console.error(`[generate] appId=${appId} uid=${uid} existing=${!!existing}:`, err);
        // Only a fresh build leaves a half-created doc behind; a failed refine
        // must leave the existing app's files/prompt/summary untouched — but
        // its "generating" claim still needs releasing, same as the abort
        // case above, or it'd stay locked for every collaborator until the
        // stale-lock timeout.
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
        } else {
          try {
            await releaseRefineLock(refineAppId!, existing.previousStatus, idToken);
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
