import { MODEL_INFO, type ModelId } from "@/lib/types";
import { generateWithAnthropic } from "./anthropic";
import { generateWithGemini, isGeminiConfigured } from "./gemini";
import {
  assertHasFiles,
  parseGenerationJSON,
  refinePrompt,
  userPrompt,
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

async function run(
  userContent: string,
  model: ModelId,
  onProgress?: ProgressFn,
  overrideKey?: string
): Promise<GenerationResult> {
  const provider = MODEL_INFO[model].provider;

  const { raw, inputTokens, outputTokens, actualCostUSD } =
    provider === "anthropic"
      ? await generateWithAnthropic(userContent, model, onProgress, overrideKey)
      : await generateWithGemini(userContent, model, onProgress, overrideKey);

  const parsed = parseGenerationJSON(raw);
  assertHasFiles(parsed);

  return {
    appName: parsed.appName || "generated-app",
    summary: parsed.summary || "",
    files: parsed.files,
    suggestions: Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((x): x is string => typeof x === "string").slice(0, 4)
      : [],
    inputTokens,
    outputTokens,
    actualCostUSD,
  };
}

/** Build a brand new app from a prompt. */
export function generateApp(
  prompt: string,
  model: ModelId,
  onProgress?: ProgressFn,
  overrideKey?: string
) {
  return run(userPrompt(prompt), model, onProgress, overrideKey);
}

/** Apply a follow-up change to an app that already has generated files. */
export function refineApp(
  originalPrompt: string,
  files: Record<string, string>,
  instruction: string,
  model: ModelId,
  onProgress?: ProgressFn,
  overrideKey?: string
) {
  return run(refinePrompt(originalPrompt, files, instruction), model, onProgress, overrideKey);
}
