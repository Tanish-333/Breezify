import Anthropic from "@anthropic-ai/sdk";

// Cap at 2: this already runs before every first-time build, so letting it
// ask more would turn "describe an app, get an app" into an interrogation.
// Two is enough to cover a request that's ambiguous in two independent ways
// (e.g. both "what kind of app" and "who's it for") without it feeling like
// a form.
const MAX_CLARIFY_QUESTIONS = 2;

const CLARIFY_SYSTEM_PROMPT = `You are a senior engineer triaging a request to build an app. Decide whether the request is clear enough to build with reasonable, sensible defaults, or whether it's genuinely too vague to build well (e.g. missing the core subject/purpose, or self-contradictory).

Be conservative: only ask a question when it's truly necessary. A missing minor detail (colors, exact fields, specific wording) is NOT a reason to ask, make a sensible default choice instead. Only ask when the app's core purpose or domain is actually unclear.

You may ask up to ${MAX_CLARIFY_QUESTIONS} questions, but only when the request is ambiguous in that many genuinely INDEPENDENT ways — most requests need zero or one, never ask a second question just to pad the list.

Respond with ONLY a JSON object, no markdown fences, no commentary, in exactly this shape:
{"needsClarification": boolean, "questions": [{"question": "a single short question", "options": ["2 to 4 short answer choices, or empty array if free-form"]}]}
"questions" should be an empty array when needsClarification is false.`;

export interface ClarifyQuestion {
  question: string;
  options: string[];
}

export interface ClarityResult {
  needsClarification: boolean;
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
 */
export async function checkClarity(prompt: string): Promise<ClarityResult> {
  const anthropic = getClient();
  if (!anthropic) return { needsClarification: false, questions: [] };

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: CLARIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `APP REQUEST: ${prompt}` }],
    });

    const block = message.content.find((b) => b.type === "text");
    const raw = block && "text" in block ? block.text : "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { needsClarification: false, questions: [] };
    }
    const parsed = JSON.parse(raw.slice(start, end + 1));
    const questions: ClarifyQuestion[] = Array.isArray(parsed.questions)
      ? parsed.questions
          .map((q: unknown) => {
            if (typeof q !== "object" || q === null) return null;
            const question = typeof (q as any).question === "string" ? (q as any).question.trim() : "";
            const options = Array.isArray((q as any).options)
              ? (q as any).options.filter((o: unknown): o is string => typeof o === "string").slice(0, 4)
              : [];
            return question ? { question, options } : null;
          })
          .filter((q: ClarifyQuestion | null): q is ClarifyQuestion => q !== null)
          .slice(0, MAX_CLARIFY_QUESTIONS)
      : [];
    return {
      needsClarification: Boolean(parsed.needsClarification) && questions.length > 0,
      questions,
    };
  } catch {
    return { needsClarification: false, questions: [] };
  }
}
