import { MODEL_INFO, type ModelId, type PlanId } from "@/lib/types";
import { generateWithAnthropic } from "./anthropic";
import { generateWithGemini, isGeminiConfigured } from "./gemini";
import {
  assertHasFiles,
  maxOutputTokensFor,
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
  plan: PlanId,
  onProgress?: ProgressFn
): Promise<GenerationResult> {
  const provider = MODEL_INFO[model].provider;
  const maxOutputTokens = maxOutputTokensFor(plan);

  const { raw, inputTokens, outputTokens, actualCostUSD } =
    provider === "anthropic"
      ? await generateWithAnthropic(userContent, model, maxOutputTokens, onProgress)
      : await generateWithGemini(userContent, model, maxOutputTokens, onProgress);

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
  plan: PlanId,
  onProgress?: ProgressFn
) {
  return run(userPrompt(prompt), model, plan, onProgress);
}

/** Apply a follow-up change to an app that already has generated files. */
export function refineApp(
  originalPrompt: string,
  files: Record<string, string>,
  instruction: string,
  model: ModelId,
  plan: PlanId,
  onProgress?: ProgressFn
) {
  return run(refinePrompt(originalPrompt, files, instruction), model, plan, onProgress);
}
