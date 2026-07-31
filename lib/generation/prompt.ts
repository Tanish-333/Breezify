import type { PlanId } from "@/lib/types";

export const SYSTEM_PROMPT = `You are an expert full-stack engineer. Generate a COMPLETE, PRODUCTION-READY application.

REQUIREMENTS:
- Modern React (TypeScript) frontend with Tailwind CSS, built with Vite
- Node.js/Express backend (or Next.js API routes) only if the app truly needs one; prefer a frontend-only app (using localStorage or an in-memory store for data) whenever that's a reasonable fit, since it can be deployed as a static site
- Full error handling, input validation, no placeholder logic
- No TODOs, no "implement this later" comments
- Include package.json, README.md, and .env.example
- package.json must include a working \`"build": "vite build"\` script and the actual "vite" and "@vitejs/plugin-react" devDependencies, so the project builds for production, not just \`npm run dev\`
- Must run immediately after \`npm install && npm run dev\`
- Prefer a small number of well-organized files over many tiny ones

Output your response as a single JSON object (no markdown fences, no commentary) with this exact shape:
{
  "appName": "short-kebab-case-name",
  "summary": "one sentence description of the app",
  "files": {
    "path/to/file.ext": "full file contents as a string",
    ...
  },
  "suggestions": ["three or four short follow-up changes the user might want next, each under 6 words"]
}

Output complete file contents, not fragments or diffs. Every file referenced by package.json or by an import must be present in "files".`;

export function userPrompt(prompt: string) {
  return `USER REQUEST: ${prompt}`;
}

/**
 * Prompt for iterating on an app that already exists. The current files are
 * included so the model edits rather than starts over, and it must return the
 * complete file set again in the same JSON shape.
 */
export function refinePrompt(
  originalPrompt: string,
  files: Record<string, string>,
  instruction: string
) {
  const listing = Object.entries(files)
    .map(([path, content]) => `--- ${path} ---\n${content}`)
    .join("\n\n");

  return `You previously built an app from this request: ${originalPrompt}

Here are its current files:

${listing}

CHANGE REQUESTED: ${instruction}

Apply the requested change. Return the COMPLETE updated file set in the same JSON shape as before, including files you did not modify and a fresh "suggestions" list. Delete a file by omitting it. Keep the app runnable. In "summary", describe what you changed in this update rather than what the app does overall.`;
}

/**
 * Token budget for a full multi-file app. Max gets real headroom for bigger
 * generations; every other plan shares the same default budget.
 */
export function maxOutputTokensFor(plan: PlanId): number {
  return plan === "max" ? 32000 : 16000;
}

export interface GenerationResult {
  appName: string;
  summary: string;
  files: Record<string, string>;
  suggestions: string[];
  inputTokens: number;
  outputTokens: number;
  actualCostUSD: number;
}

/** What a provider returns before the JSON body is parsed. */
export interface ProviderResult {
  raw: string;
  inputTokens: number;
  outputTokens: number;
  actualCostUSD: number;
}

/**
 * Called as the model streams. `chars` is the total response length so far and
 * `files` are the file paths detected in the partial JSON, so the UI can show
 * real progress instead of an indeterminate spinner.
 */
export type ProgressFn = (progress: { chars: number; files: string[] }) => void;

const FILE_PATH_RE = /"((?:[\w.@-]+\/)*[\w.@-]+\.[A-Za-z0-9]+)"\s*:\s*"/g;

/**
 * Pulls file paths out of a partially-streamed JSON body. Only looks at the
 * "files" object so keys from elsewhere in the payload aren't mistaken for
 * filenames.
 */
export function detectFiles(partial: string): string[] {
  const filesAt = partial.indexOf('"files"');
  if (filesAt === -1) return [];
  const scope = partial.slice(filesAt);
  const found: string[] = [];
  let m: RegExpExecArray | null;
  FILE_PATH_RE.lastIndex = 0;
  while ((m = FILE_PATH_RE.exec(scope)) !== null) {
    found.push(m[1]);
  }
  return found;
}

/**
 * Models occasionally wrap JSON in prose or a markdown fence despite being
 * told not to, so pull out the outermost JSON object before parsing.
 */
export function parseGenerationJSON(raw: string): {
  appName?: string;
  summary?: string;
  files?: Record<string, string>;
  suggestions?: string[];
} {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The model did not return a valid app. Please try again.");
  }
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error(
      "The model's response was cut off before it finished. Try a simpler prompt or a more capable model."
    );
  }
}

export function assertHasFiles<T extends { files?: Record<string, string> }>(
  parsed: T
): asserts parsed is T & { files: Record<string, string> } {
  if (!parsed.files || Object.keys(parsed.files).length === 0) {
    throw new Error("The model did not return any files. Please try again.");
  }
}
