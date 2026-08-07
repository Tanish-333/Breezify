// Barrel of every hand-written template's static file bundle — see
// lib/templates.ts for the matching id/title/prompt/description metadata,
// and app/api/apps/from-template/route.ts for how a bundle here becomes a
// real apps/{appId} doc's generatedCode.files when a Pro+ user duplicates
// a template. Every bundle is a complete, real Vite+React+TypeScript+
// Tailwind app — no AI pipeline involved, so duplicating a template costs
// nothing and needs no admin seeding step.
import { files as habitTrackerFiles } from "./habit-tracker";
import { files as markdownNotesFiles } from "./markdown-notes";
import { files as invoiceGeneratorFiles } from "./invoice-generator";
import { files as teamStandupFiles } from "./team-standup";
import { files as miniCrmFiles } from "./mini-crm";
import { files as budgetTrackerFiles } from "./budget-tracker";
import { files as recipeBoxFiles } from "./recipe-box";
import { files as linkInBioFiles } from "./link-in-bio";
import { files as triviaQuizFiles } from "./trivia-quiz";
import { files as pomodoroTimerFiles } from "./pomodoro-timer";
import { files as inventoryTrackerFiles } from "./inventory-tracker";
import { files as ptoTrackerFiles } from "./pto-tracker";

/** Keyed by lib/templates.ts' AppTemplate.id. */
export const TEMPLATE_APP_FILES: Record<string, Record<string, string>> = {
  "habit-tracker": habitTrackerFiles,
  "markdown-notes": markdownNotesFiles,
  "invoice-generator": invoiceGeneratorFiles,
  "team-standup": teamStandupFiles,
  "mini-crm": miniCrmFiles,
  "budget-tracker": budgetTrackerFiles,
  "recipe-box": recipeBoxFiles,
  "link-in-bio": linkInBioFiles,
  "trivia-quiz": triviaQuizFiles,
  "pomodoro-timer": pomodoroTimerFiles,
  "inventory-tracker": inventoryTrackerFiles,
  "pto-tracker": ptoTrackerFiles,
};
