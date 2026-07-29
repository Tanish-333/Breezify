import Anthropic from "@anthropic-ai/sdk";
import { MODEL_INFO, type ModelId } from "@/lib/types";

let client: Anthropic | null = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set.");
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You are an expert full-stack engineer. Generate a COMPLETE, PRODUCTION-READY application.

REQUIREMENTS:
- Modern React (TypeScript) frontend with Tailwind CSS
- Node.js/Express backend (or Next.js API routes) if the app needs one
- Full error handling, input validation, no placeholder logic
- No TODOs, no "implement this later" comments
- Include package.json, .env.example, Dockerfile
- Must run immediately after \`npm install && npm run build\`

Output your response as a single JSON object (no markdown fences, no commentary) with this exact shape:
{
  "appName": "short-kebab-case-name",
  "summary": "one sentence description of the app",
  "files": {
    "path/to/file.ext": "full file contents as a string",
    ...
  }
}

Output complete file contents, not fragments or diffs. Every file referenced by package.json or imports must be present in "files".`;

export interface GenerationResult {
  appName: string;
  summary: string;
  files: Record<string, string>;
  inputTokens: number;
  outputTokens: number;
  actualCostUSD: number;
}

// Per-token pricing (USD) used for internal margin tracking.
const PRICE_PER_MTOK: Record<ModelId, { input: number; output: number }> = {
  haiku: { input: 1.0, output: 5.0 },
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 5.0, output: 25.0 },
};

// Full multi-file app output can be large; stream to avoid HTTP timeouts on
// requests with a high max_tokens (see Anthropic API guidance: stream above ~16K).
const MAX_TOKENS = 16000;

export async function generateApp(prompt: string, model: ModelId): Promise<GenerationResult> {
  const anthropic = getClient();
  const apiModel = MODEL_INFO[model].apiModel;

  const stream = anthropic.messages.stream({
    model: apiModel,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `USER REQUEST: ${prompt}` }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(
      "Claude declined to generate this app. Try rephrasing your request."
    );
  }

  const textBlock = message.content.find((b) => b.type === "text");
  const raw = textBlock && "text" in textBlock ? textBlock.text : "{}";

  let parsed: { appName?: string; summary?: string; files?: Record<string, string> };
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    throw new Error("Claude returned an unparsable response. Please try again.");
  }

  const pricing = PRICE_PER_MTOK[model];
  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  const actualCostUSD =
    (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;

  if (!parsed.files || Object.keys(parsed.files).length === 0) {
    throw new Error("Claude did not return any files. Please try again.");
  }

  return {
    appName: parsed.appName || "feather-app",
    summary: parsed.summary || "",
    files: parsed.files,
    inputTokens,
    outputTokens,
    actualCostUSD,
  };
}
