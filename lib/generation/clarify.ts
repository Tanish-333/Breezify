import Anthropic from "@anthropic-ai/sdk";

// Hard cap on how many questions one build can ever ask — this is a triage
// step, not an interrogation. Asking before every single build kills the
// "describe an app, get an app" experience that's the whole product, so the
// system prompt below is written to make the model reach for zero whenever
// it reasonably can, and this cap is the backstop if it doesn't.
const MAX_QUESTIONS = 2;

const CLARIFY_SYSTEM_PROMPT = `You are a senior engineer triaging a request to build an app. Decide whether the request is clear enough to build with reasonable, sensible defaults, or whether it's genuinely too vague to build well in one or more INDEPENDENT ways (e.g. the core subject/purpose is missing, or two different unrelated decisions both need the user's input).

Be conservative: only ask a question when it's truly necessary. A missing minor detail (colors, exact fields, specific wording) is NOT a reason to ask, make a sensible default choice instead. Only ask when the app's core purpose or domain is actually unclear. Most requests need zero questions. Never ask more than ${MAX_QUESTIONS} questions, and only ask a second one if it's genuinely a separate ambiguity from the first, not a follow-up to it.

Respond with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{"questions": [{"question": "a single short question", "options": ["2 to 4 short answer choices, or empty array if free-text makes more sense"]}]}
The "questions" array should be empty if no clarification is needed, and never contain more than ${MAX_QUESTIONS} entries.`;

export interface ClarifyQuestion {
  question: string;
  options: string[];
}

export interface ClarityResult {
  questions: ClarifyQuestion[];
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
 *
 * Returns 0-2 questions (see MAX_QUESTIONS) rather than a single one, for
 * requests that are ambiguous in more than one independent way at once.
 * The caller charges a single flat fee for the whole round regardless of
 * how many questions come back — see app/api/generate/route.ts.
 */
export async function checkClarity(prompt: string): Promise<ClarityResult> {
  const anthropic = getClient();
  if (!anthropic) return { questions: [] };

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 500,
      system: CLARIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `APP REQUEST: ${prompt}` }],
    });

    const block = message.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return { questions: [] };

    const parsed = JSON.parse(raw.slice(start, end + 1));
    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : [];
    const questions = rawQuestions
      .map((q: any): ClarifyQuestion | null => {
        const question = typeof q?.question === "string" ? q.question.trim() : "";
        if (!question) return null;
        const options = Array.isArray(q?.options)
          ? q.options.filter((o: unknown): o is string => typeof o === "string").slice(0, 4)
          : [];
        return { question, options };
      })
      .filter((q: ClarifyQuestion | null): q is ClarifyQuestion => q !== null)
      .slice(0, MAX_QUESTIONS);

    return { questions };
  } catch {
    return { questions: [] };
  }
}
