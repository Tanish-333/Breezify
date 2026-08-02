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
    throw new Error(`Groq request failed (${res.status}): ${text.slice(0, 300) || "no response body"}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let inputTokens = 0;
  let outputTokens = 0;

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
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        raw += delta;
        onProgress?.({ chars: raw.length, files: detectFiles(raw) });
      }
      // Groq includes usage on the final streamed chunk under x_groq.usage,
      // falling back to a plain "usage" key to match the OpenAI shape.
      const usage = chunk.x_groq?.usage ?? chunk.usage;
      if (usage) {
        inputTokens = usage.prompt_tokens ?? inputTokens;
        outputTokens = usage.completion_tokens ?? outputTokens;
      }
    }
  }

  if (!raw.trim()) {
    throw new Error("Groq returned an empty response. Please try again.");
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
