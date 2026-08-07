export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  content: string[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "prompt-to-production",
    title: "From prompt to production in one sitting",
    excerpt:
      "Most app builders make you choose between a quick prototype and real, ownable code. Here is how Breezify gives you both.",
    date: "2026-07-22",
    content: [
      "Most app builders make you choose between speed and control. You either get a working prototype with no real code underneath, or you get full control but have to write everything yourself starting from a blank file.",
      "Breezify is built around a different idea. You describe the app you want in plain English, and it writes a real, complete codebase for it: a frontend, a backend where one is needed, and the configuration to run both. Nothing about the output is a black box. Every file it writes is one you could have written yourself, and on the Plus plan and above you can open the built in editor and do exactly that.",
      "Once the app is generated, you see it running immediately in a live preview, before you deploy anything. That preview runs the actual code in a sandboxed frame, so what you see is what will actually ship, not a mockup standing in for the real thing.",
      "When it looks right, deploying takes one click. Breezify sends the app to its own Vercel project and hands you back a live URL in under a minute. There is no server to provision and no domain to buy first; you can always attach a custom domain later once the app is live.",
      "The part that tends to surprise people is what happens after that first version. Refining an app is just another message in the same chat: describe what should change, and Breezify edits the existing code in place rather than starting over from scratch. The app you end up with looks like something a team wrote deliberately, because in a real sense it was, one plain English instruction at a time.",
    ],
  },
  {
    slug: "choosing-a-model",
    title: "Picking a model: Haiku, Sonnet, or Opus",
    excerpt:
      "Breezify lets you choose the model behind every generation. Here is how to think about which one fits the app you are building.",
    date: "2026-08-01",
    content: [
      "Every generation on Breezify runs on a real language model, and you get to choose which one. That choice matters more than it might seem, because the model you pick affects both how capable the result is and how many credits the generation costs.",
      "Haiku 4.5 is the fastest and cheapest option, and it is a genuinely good default. For a simple tracker, a small dashboard, or a landing page, Haiku usually gets you a clean, working app on the first try, and you can iterate quickly since each refine costs very little.",
      "Sonnet sits in the middle. It handles more moving parts well: an app with several connected views, real data validation, or a workflow with multiple states, the kind of thing where a mistake in one place quietly breaks another. If your first Haiku attempt needed a lot of correction, Sonnet is usually the right next step rather than more retries on the same model.",
      "Opus is for the apps where reasoning is the hard part, not the typing. Complex business logic, an unusual data model, or a spec with a lot of edge cases benefit from the extra thought Opus puts into a generation before it writes a single line.",
      "A practical rule that works for most people: start on Haiku, and only move up if the result needs more correction than you would want to do by hand. You are never locked into one model either; you can switch per generation, so the model powering your next refine does not have to be the one that built the first version.",
    ],
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}
