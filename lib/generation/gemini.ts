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

export async function generateWithGemini(
  userContent: string,
  model: ModelId,
  maxOutputTokens: number,
  onProgress?: ProgressFn,
  signal?: AbortSignal
): Promise<ProviderResult> {
  const ai = getClient();
  const apiModel = MODEL_INFO[model].apiModel;

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

  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) {
      raw += text;
      onProgress?.({ chars: raw.length, files: detectFiles(raw) });
    }
    // Usage arrives on the final chunks; keep the latest non-zero values.
    const usage = chunk.usageMetadata;
    if (usage) {
      inputTokens = usage.promptTokenCount ?? inputTokens;
      outputTokens = usage.candidatesTokenCount ?? outputTokens;
    }
  }

  if (!raw.trim()) {
    throw new Error("Gemini returned an empty response. Please try again.");
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
