import { MODEL_INFO, type ModelId } from "@/lib/types";
import { generateWithAnthropic } from "./anthropic";
import { generateWithGemini, isGeminiConfigured } from "./gemini";
import {
  assertHasFiles,
  parseGenerationJSON,
  type GenerationResult,
  type ProgressFn,
} from "./prompt";

export type { GenerationResult, ProgressFn } from "./prompt";

/** Whether the provider backing this model has an API key configured. */
export function isModelAvailable(model: ModelId): boolean {
  const provider = MODEL_INFO[model].provider;
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY);
  return isGeminiConfigured();
}

export async function generateApp(
  prompt: string,
  model: ModelId,
  onProgress?: ProgressFn
): Promise<GenerationResult> {
  const provider = MODEL_INFO[model].provider;

  const { raw, inputTokens, outputTokens, actualCostUSD } =
    provider === "anthropic"
      ? await generateWithAnthropic(prompt, model, onProgress)
      : await generateWithGemini(prompt, model, onProgress);

  const parsed = parseGenerationJSON(raw);
  assertHasFiles(parsed);

  return {
    appName: parsed.appName || "generated-app",
    summary: parsed.summary || "",
    files: parsed.files,
    inputTokens,
    outputTokens,
    actualCostUSD,
  };
}
