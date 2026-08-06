// One-time (or re-run-per-template) script that generates the real seed
// apps behind the dashboard's Templates section (see lib/templates.ts,
// components/templates-section.tsx). Deliberately NOT run as part of any
// build/deploy step — it costs real model credits and writes real Firestore
// documents under a system account, so it's a manual operation you run
// against a live deployment once you have one.
//
// What it does, per template in lib/templates.ts:
//   1. Signs in the template account (email/password) via the Firebase Auth
//      REST API — the same one the web client uses, just without a browser.
//   2. POSTs that template's prompt to /api/generate on your live
//      deployment (same endpoint the dashboard composer uses), streaming
//      the SSE response until it gets a "done" event with the new appId.
//   3. Marks the new app isTemplate: true via a direct Firestore REST PATCH,
//      authenticated as the template account (its own app, so
//      firestore.rules' isAppEditor lets the owner update any field) — this
//      is the flag app/api/apps/duplicate and firestore.rules check to let
//      ANY signed-in user duplicate it regardless of plan-gated edit access.
//
// Usage:
//   TEMPLATE_ACCOUNT_EMAIL=templates@breezify.dev \
//   TEMPLATE_ACCOUNT_PASSWORD=... \
//   BREEZIFY_BASE_URL=https://breezify.dev \
//   node scripts/seed-templates.mjs
//
// Prints an `id -> appId` line per template when it finishes — paste those
// into lib/templates.ts's seedAppId fields. Until that's done, each
// template card falls back to prefilling the prompt composer instead
// (see components/templates-section.tsx), so nothing is broken by leaving
// this unrun.

// Plain Node script (no tsx/ts-node in this project's devDependencies), so
// it can't import lib/templates.ts's TEMPLATES array directly — this is a
// deliberately minimal mirror of it (id, title, prompt only; nothing else
// here needs the icon or category). Keep in sync by hand if lib/templates.ts
// changes; it's small and rarely-run enough that a build-time sync step
// would be more machinery than the problem is worth.
const TEMPLATES = [
  { id: "habit-tracker", title: "Habit tracker", prompt: "A habit tracker with a list of daily habits, streak counts, and a calendar heatmap showing completion history for the last 3 months." },
  { id: "markdown-notes", title: "Markdown notes", prompt: "A markdown notes app with a sidebar of notes, tags, folders, live markdown preview, and full-text search across all notes." },
  { id: "invoice-generator", title: "Invoice generator", prompt: "An invoice generator with a client list, line items with quantity and price, automatic totals and tax, and a printable/PDF-style invoice preview." },
  { id: "standup-board", title: "Team standup board", prompt: "A team standup board where teammates post async daily check-ins (yesterday/today/blockers), grouped by day, with a simple team member list." },
  { id: "mini-crm", title: "Mini CRM", prompt: "A simple CRM with a contacts list and a kanban-style deal pipeline (Lead, Contacted, Proposal, Won, Lost) that deals can be dragged between." },
  { id: "budget-tracker", title: "Budget tracker", prompt: "A personal budget tracker with categorized income/expense entries, a monthly summary, and a chart breaking down spend by category." },
  { id: "recipe-box", title: "Recipe box", prompt: "A recipe box app for saving recipes with ingredients, steps, tags (cuisine, diet), and a search/filter bar across all saved recipes." },
  { id: "link-in-bio", title: "Link-in-bio page", prompt: "A link-in-bio page with a profile photo, name, short bio, and a list of clickable link buttons that can be reordered, plus a simple click-count for each link." },
  { id: "trivia-quiz", title: "Trivia quiz", prompt: "A trivia quiz game with multiple-choice questions, a countdown timer per question, running score, and a final results screen." },
  { id: "pomodoro-timer", title: "Pomodoro timer", prompt: "A pomodoro timer with configurable focus/break lengths, a running session, sound on completion, and a history log of past sessions." },
];

const FIREBASE_API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDJJUs4d0CC4RhAY2YfQPDSWX9MxOcm5hI";
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "feather-123";
const BASE_URL = process.env.BREEZIFY_BASE_URL;
const EMAIL = process.env.TEMPLATE_ACCOUNT_EMAIL;
const PASSWORD = process.env.TEMPLATE_ACCOUNT_PASSWORD;
const MODEL = process.env.SEED_MODEL || "haiku";

if (!BASE_URL || !EMAIL || !PASSWORD) {
  console.error(
    "Missing env vars. Required: BREEZIFY_BASE_URL, TEMPLATE_ACCOUNT_EMAIL, TEMPLATE_ACCOUNT_PASSWORD."
  );
  process.exit(1);
}

async function signIn() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Sign-in failed: ${data.error?.message || res.statusText}`);
  return data.idToken;
}

/** Streams /api/generate's SSE response and resolves with the finished appId. */
async function generateApp(idToken, prompt) {
  const res = await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ prompt, model: MODEL, clarified: true }),
  });
  if (!res.body) throw new Error("No response body from /api/generate.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === "status") console.log(`   ${event.message}`);
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "done") return event.appId;
    }
  }
  throw new Error("Stream ended without a done event.");
}

/** Marks the freshly generated app as a public duplicate source — see firestore.rules' apps/{appId} read rule. */
async function markAsTemplate(idToken, appId) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/apps/${appId}?updateMask.fieldPaths=isTemplate`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields: { isTemplate: { booleanValue: true } } }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Couldn't mark ${appId} as a template: ${data.error?.message || res.statusText}`);
  }
}

async function main() {
  console.log(`Signing in as ${EMAIL}...`);
  const idToken = await signIn();

  const results = [];
  for (const template of TEMPLATES) {
    console.log(`\nGenerating "${template.title}" (${template.id})...`);
    try {
      const appId = await generateApp(idToken, template.prompt);
      await markAsTemplate(idToken, appId);
      console.log(`  done: ${template.id} -> ${appId}`);
      results.push({ id: template.id, appId });
    } catch (err) {
      console.error(`  FAILED: ${template.id}: ${err.message}`);
    }
  }

  console.log("\nPaste these into lib/templates.ts as each template's seedAppId:\n");
  for (const { id, appId } of results) console.log(`  ${id}: "${appId}"`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
