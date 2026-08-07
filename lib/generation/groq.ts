import { MODEL_INFO, type ModelId } from "@/lib/types";
import { SYSTEM_PROMPT, detectFiles, type ProviderResult, type ProgressFn } from "./prompt";

// Groq exposes an OpenAI-compatible chat completions API, so this talks to
// it directly over fetch rather than pulling in a separate SDK.
const GROQ_API = "https://api.groq.com/openai/v1/chat/completions";

export function isGroqConfigured() {
  return Boolean(process.env.GROQ_API_KEY);
}

// USD per million tokens, for internal margin tracking only. Groq's lineup
// and prices change often, verify against console.groq.com/pricing.
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79 },
  "openai/gpt-oss-120b": { input: 0.15, output: 0.75 },
};

// See the matching comment in lib/generation/anthropic.ts — transient
// failures (rate limits, momentary 5xx) are common enough under real
// traffic to be worth one retry before charging the failure to the user,
// as long as nothing has streamed yet.
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503]);
const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [500, 1500];

export async function generateWithGroq(
  userContent: string,
  model: ModelId,
  maxOutputTokens: number,
  onProgress?: ProgressFn,
  signal?: AbortSignal
): Promise<ProviderResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Groq models aren't configured on this deployment yet. Set GROQ_API_KEY.");
  }
  const apiModel = MODEL_INFO[model].apiModel;

  async function attemptOnce() {
    const res = await fetch(GROQ_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: apiModel,
        stream: true,
        max_tokens: maxOutputTokens,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      const err = new Error(`Groq request failed (${res.status}): ${text.slice(0, 300) || "no response body"}`);
      (err as Error & { status?: number }).status = res.status;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let raw = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) {
          raw += delta;
          onProgress?.({ chars: raw.length, files: detectFiles(raw) });
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        // Groq includes usage on the final streamed chunk under x_groq.usage,
        // falling back to a plain "usage" key to match the OpenAI shape.
        const usage = chunk.x_groq?.usage ?? chunk.usage;
        if (usage) {
          inputTokens = usage.prompt_tokens ?? inputTokens;
          outputTokens = usage.completion_tokens ?? outputTokens;
        }
      }
    }

    return { raw, inputTokens, outputTokens, finishReason };
  }

  let raw = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let finishReason: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const result = await attemptOnce();
      ({ raw, inputTokens, outputTokens, finishReason } = result);
      break;
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      const canRetry =
        attempt < MAX_ATTEMPTS &&
        raw.length === 0 &&
        !signal?.aborted &&
        (status === undefined || RETRYABLE_STATUS.has(status));
      if (!canRetry) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1] ?? 1500));
    }
  }

  if (!raw.trim()) {
    throw new Error("Groq returned an empty response. Please try again.");
  }

  // A response cut off by the max_tokens budget can still look like
  // syntactically valid JSON up to wherever it stopped, so relying on
  // JSON.parse to fail downstream isn't reliable — it can silently succeed
  // with files missing or truncated instead. finish_reason "length" is the
  // API telling us directly that it ran out of room.
  if (finishReason === "length") {
    throw new Error(
      "The generation ran out of room before it finished (too much code for one response). Try a smaller request, split it into a follow-up refine, or switch to a model with more output headroom."
    );
  }

  const pricing = PRICE_PER_MTOK[apiModel] ?? { input: 0.5, output: 0.8 };

  return {
    raw,
    inputTokens,
    outputTokens,
    actualCostUSD:
      (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output,
  };
}
