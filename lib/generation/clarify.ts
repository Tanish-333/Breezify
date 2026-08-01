import Anthropic from "@anthropic-ai/sdk";

const CLARIFY_SYSTEM_PROMPT = `You are a senior engineer triaging a request to build an app. Decide whether the request is clear enough to build with reasonable, sensible defaults, or whether it's genuinely too vague to build well (e.g. missing the core subject/purpose, or self-contradictory).

Be conservative: only ask a question when it's truly necessary. A missing minor detail (colors, exact fields, specific wording) is NOT a reason to ask, make a sensible default choice instead. Only ask when the app's core purpose or domain is actually unclear.

Respond with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{"needsClarification": boolean, "question": "a single short question, or empty string if not needed", "options": ["2 to 4 short answer choices, or empty array if not needed"]}`;

export interface ClarityResult {
  needsClarification: boolean;
  question: string;
  options: string[];
}

let client: Anthropic | null = null;

function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Cheap, fast ambiguity check run before a first-time build (never for
 * refines, which already have real context to work from). Uses the
 * smallest model regardless of what the user picked, since this is a
 * triage step, not the actual generation. Fails open: if the check itself
 * errors out, treat the prompt as clear rather than blocking the build.
 */
export async function checkClarity(prompt: string): Promise<ClarityResult> {
  const anthropic = getClient();
  if (!anthropic) return { needsClarification: false, question: "", options: [] };

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 300,
      system: CLARIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `APP REQUEST: ${prompt}` }],
    });

    const block = message.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { needsClarification: false, question: "", options: [] };
    }
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const question = typeof parsed.question === "string" ? parsed.question.trim() : "";
    const options = Array.isArray(parsed.options)
      ? parsed.options.filter((o: unknown): o is string => typeof o === "string").slice(0, 4)
      : [];
    return {
      needsClarification: Boolean(parsed.needsClarification) && question.length > 0,
      question,
      options,
    };
  } catch {
    return { needsClarification: false, question: "", options: [] };
  }
}
