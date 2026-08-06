import Anthropic from "@anthropic-ai/sdk";
import { MODEL_INFO, type ModelId } from "@/lib/types";
import {
  SYSTEM_PROMPT,
  detectFiles,
  type ProviderResult,
  type ProgressFn,
} from "./prompt";

let client: Anthropic | null = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Anthropic models aren't configured on this deployment yet. Set ANTHROPIC_API_KEY.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

// USD per million tokens, for internal margin tracking only.
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
  "claude-sonnet-4-5": { input: 3.0, output: 15.0 },
  "claude-opus-5": { input: 5.0, output: 25.0 },
};

export async function generateWithAnthropic(
  userContent: string,
  model: ModelId,
  maxOutputTokens: number,
  onProgress?: ProgressFn,
  signal?: AbortSignal
): Promise<ProviderResult> {
  const anthropic = getClient();
  const apiModel = MODEL_INFO[model].apiModel;

  // SYSTEM_PROMPT is identical on every call, for every user, forever — marking
  // it as an ephemeral cache breakpoint means only the first call in each 5min
  // window pays full price for it; every call after reads it at ~10% of the
  // input-token cost. Below each model's minimum cacheable prefix (varies by
  // model, see shared/prompt-caching.md) the marker is simply a no-op, not an
  // error, so this is safe to leave on unconditionally.
  const stream = anthropic.messages.stream(
    {
      model: apiModel,
      max_tokens: maxOutputTokens,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userContent }],
    },
    { signal }
  );

  let raw = "";
  if (onProgress) {
    stream.on("text", (delta) => {
      raw += delta;
      onProgress({ chars: raw.length, files: detectFiles(raw) });
    });
  }

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("Claude declined to build this app. Try rephrasing your request.");
  }

  if (!raw) {
    const textBlock = message.content.find((b) => b.type === "text");
    raw = textBlock && "text" in textBlock ? textBlock.text : "";
  }

  const pricing = PRICE_PER_MTOK[apiModel] ?? { input: 3.0, output: 15.0 };
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  // Cache writes cost 1.25x the normal input rate, cache reads ~0.1x — without
  // these, a cache hit would look identical to a cache miss in cost tracking
  // and understate what caching is actually saving (or, on a write, overstate it).
  const cacheCreationTokens = message.usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = message.usage.cache_read_input_tokens ?? 0;

  return {
    raw,
    inputTokens,
    outputTokens,
    actualCostUSD:
      (inputTokens / 1_000_000) * pricing.input +
      (cacheCreationTokens / 1_000_000) * pricing.input * 1.25 +
      (cacheReadTokens / 1_000_000) * pricing.input * 0.1 +
      (outputTokens / 1_000_000) * pricing.output,
  };
}
