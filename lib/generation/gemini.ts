import { GoogleGenAI } from "@google/genai";
import { MODEL_INFO, type ModelId } from "@/lib/types";
import {
  SYSTEM_PROMPT,
  detectFiles,
  type ProviderResult,
  type ProgressFn,
} from "./prompt";

let client: GoogleGenAI | null = null;

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini models aren't configured on this deployment yet. Set GEMINI_API_KEY.");
  }
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

/** Whether Gemini-backed models can currently run. */
export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

// USD per million tokens, for internal margin tracking only.
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "gemini-3.6-flash": { input: 0.3, output: 2.5 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 10.0 },
};

// See the matching comment in lib/generation/anthropic.ts — transient
// failures (rate limits, momentary overload/5xx) are common enough under
// real traffic to be worth one retry before charging the failure to the
// user, as long as nothing has streamed yet.
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];

function isRetryableError(err: unknown): boolean {
  const status = (err as { status?: number; code?: number } | null)?.status ?? (err as any)?.code;
  if (status === undefined) return true;
  return RETRYABLE_STATUS.has(Number(status));
}

export async function generateWithGemini(
  userContent: string,
  model: ModelId,
  maxOutputTokens: number,
  onProgress?: ProgressFn,
  signal?: AbortSignal
): Promise<ProviderResult> {
  const ai = getClient();
  const apiModel = MODEL_INFO[model].apiModel;

  async function attemptOnce() {
    const stream = await ai.models.generateContentStream({
      model: apiModel,
      contents: userContent,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens,
        // Gemini can hard-guarantee JSON output, so we don't have to rely on
        // the model honoring the "no markdown fences" instruction.
        responseMimeType: "application/json",
        abortSignal: signal,
      },
    });

    let raw = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: string | undefined;

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        raw += text;
        onProgress?.({ chars: raw.length, files: detectFiles(raw) });
      }
      const reason = chunk.candidates?.[0]?.finishReason;
      if (reason) finishReason = reason;
      // Usage arrives on the final chunks; keep the latest non-zero values.
      const usage = chunk.usageMetadata;
      if (usage) {
        inputTokens = usage.promptTokenCount ?? inputTokens;
        outputTokens = usage.candidatesTokenCount ?? outputTokens;
      }
    }

    return { raw, inputTokens, outputTokens, finishReason };
  }

  let raw = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await attemptOnce();
      ({ raw, inputTokens, outputTokens, finishReason } = result);
      break;
    } catch (err) {
      const canRetry = attempt < MAX_ATTEMPTS && raw.length === 0 && !signal?.aborted && isRetryableError(err);
      if (!canRetry) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1] ?? 1500));
    }
  }

  if (!raw.trim()) {
    throw new Error("Gemini returned an empty response. Please try again.");
  }

  // A response cut off by the max_tokens budget can still look like
  // syntactically valid JSON up to wherever it stopped, so relying on
  // JSON.parse to fail downstream isn't reliable — it can silently succeed
  // with files missing or truncated instead. finishReason "MAX_TOKENS" is
  // the API telling us directly that it ran out of room.
  if (finishReason === "MAX_TOKENS") {
    throw new Error(
      "The generation ran out of room before it finished (too much code for one response). Try a smaller request, split it into a follow-up refine, or switch to a model with more output headroom."
    );
  }

  const pricing = PRICE_PER_MTOK[apiModel] ?? { input: 1.25, output: 10.0 };

  return {
    raw,
    inputTokens,
    outputTokens,
    actualCostUSD:
      (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output,
  };
}
