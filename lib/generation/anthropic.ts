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
  onProgress?: ProgressFn
): Promise<ProviderResult> {
  const anthropic = getClient();
  const apiModel = MODEL_INFO[model].apiModel;

  const stream = anthropic.messages.stream({
    model: apiModel,
    max_tokens: maxOutputTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

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

  return {
    raw,
    inputTokens,
    outputTokens,
    actualCostUSD:
      (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output,
  };
}
