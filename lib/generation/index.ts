import { MODEL_INFO, type ModelId, type PlanId } from "@/lib/types";
import { generateWithAnthropic } from "./anthropic";
import { generateWithGemini, isGeminiConfigured } from "./gemini";
import { generateWithGroq, isGroqConfigured } from "./groq";
import {
  assertHasFiles,
  maxOutputTokensFor,
  mergeRefineFiles,
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
  if (provider === "groq") return isGroqConfigured();
  return isGeminiConfigured();
}

async function callModel(
  userContent: string,
  model: ModelId,
  plan: PlanId,
  onProgress?: ProgressFn,
  signal?: AbortSignal
) {
  const provider = MODEL_INFO[model].provider;
  const maxOutputTokens = maxOutputTokensFor(plan);

  const { raw, inputTokens, outputTokens, actualCostUSD } =
    provider === "anthropic"
      ? await generateWithAnthropic(userContent, model, maxOutputTokens, onProgress, signal)
      : provider === "groq"
        ? await generateWithGroq(userContent, model, maxOutputTokens, onProgress, signal)
        : await generateWithGemini(userContent, model, maxOutputTokens, onProgress, signal);

  return { parsed: parseGenerationJSON(raw), inputTokens, outputTokens, actualCostUSD };
}

function suggestionsFrom(parsed: { suggestions?: string[] }): string[] {
  return Array.isArray(parsed.suggestions)
    ? parsed.suggestions.filter((x): x is string => typeof x === "string").slice(0, 4)
    : [];
}

/** Build a brand new app from a prompt. */
export async function generateApp(
  prompt: string,
  appId: string,
  model: ModelId,
  plan: PlanId,
  onProgress?: ProgressFn,
  signal?: AbortSignal
): Promise<GenerationResult> {
  const { parsed, inputTokens, outputTokens, actualCostUSD } = await callModel(
    userPrompt(prompt, appId),
    model,
    plan,
    onProgress,
    signal
  );
  assertHasFiles(parsed);

  return {
    appName: parsed.appName || "generated-app",
    summary: parsed.summary || "",
    files: parsed.files,
    suggestions: suggestionsFrom(parsed),
    inputTokens,
    outputTokens,
    actualCostUSD,
  };
}

/** Apply a follow-up change to an app that already has generated files. */
export async function refineApp(
  originalPrompt: string,
  files: Record<string, string>,
  instruction: string,
  appId: string,
  model: ModelId,
  plan: PlanId,
  onProgress?: ProgressFn,
  signal?: AbortSignal
): Promise<GenerationResult> {
  const { parsed, inputTokens, outputTokens, actualCostUSD } = await callModel(
    refinePrompt(originalPrompt, files, instruction, appId),
    model,
    plan,
    onProgress,
    signal
  );

  // A refine that comes back with no changed files and nothing deleted
  // means the model responded without actually editing anything — talked
  // instead of coding (asking a clarifying question, describing what it
  // WOULD do, refusing, etc.). Checking the merged total below doesn't
  // catch this: merging {} onto the app's own existing (non-empty) files
  // is a no-op that leaves `merged` non-empty, so this used to silently
  // "succeed" as a turn that charged full price and changed nothing, with
  // no error and no visible sign anything was wrong.
  const changedFiles = parsed.files && Object.keys(parsed.files).length > 0;
  const deletedFiles = parsed.deletedFiles && parsed.deletedFiles.length > 0;
  if (!changedFiles && !deletedFiles) {
    throw new Error(
      "The model responded without making any changes. Try rephrasing your request, or describing it more specifically."
    );
  }

  const merged = mergeRefineFiles(files, parsed.files ?? {}, parsed.deletedFiles ?? []);
  if (Object.keys(merged).length === 0) {
    throw new Error("The model did not return any files. Please try again.");
  }

  return {
    appName: parsed.appName || "generated-app",
    summary: parsed.summary || "",
    files: merged,
    suggestions: suggestionsFrom(parsed),
    inputTokens,
    outputTokens,
    actualCostUSD,
  };
}
