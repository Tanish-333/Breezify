import {
  BookOpen,
  CalendarCheck,
  Gamepad2,
  Kanban,
  Link2,
  NotebookPen,
  Receipt,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type TemplateCategory = "Productivity" | "Business" | "Personal" | "Fun";

export interface Template {
  id: string;
  category: TemplateCategory;
  title: string;
  description: string;
  /** Also the prompt a real seed app was generated from (see scripts/seed-templates.ts) — reused as the prefill fallback below when seedAppId isn't set yet. */
  prompt: string;
  icon: LucideIcon;
  /**
   * The system/template account's real generated app this card duplicates —
   * see app/api/apps/duplicate. Unset until scripts/seed-templates.ts has
   * actually been run against a live deployment (it needs real provider API
   * keys and a live Firebase project, neither of which exist in every
   * environment this code ships to). A card with no seedAppId falls back to
   * prefilling the prompt composer with `prompt` instead of failing outright
   * — see components/templates-section.tsx.
   */
  seedAppId?: string;
}

export const TEMPLATES: Template[] = [
  {
    id: "habit-tracker",
    category: "Productivity",
    title: "Habit tracker",
    description: "Daily streaks and a calendar heatmap.",
    prompt:
      "A habit tracker with a list of daily habits, streak counts, and a calendar heatmap showing completion history for the last 3 months.",
    icon: CalendarCheck,
  },
  {
    id: "markdown-notes",
    category: "Productivity",
    title: "Markdown notes",
    description: "Tags, folders, and full-text search.",
    prompt:
      "A markdown notes app with a sidebar of notes, tags, folders, live markdown preview, and full-text search across all notes.",
    icon: NotebookPen,
  },
  {
    id: "invoice-generator",
    category: "Business",
    title: "Invoice generator",
    description: "Client list, line items, printable export.",
    prompt:
      "An invoice generator with a client list, line items with quantity and price, automatic totals and tax, and a printable/PDF-style invoice preview.",
    icon: Receipt,
  },
  {
    id: "standup-board",
    category: "Business",
    title: "Team standup board",
    description: "Async daily check-ins, grouped by day.",
    prompt:
      "A team standup board where teammates post async daily check-ins (yesterday/today/blockers), grouped by day, with a simple team member list.",
    icon: Users,
  },
  {
    id: "mini-crm",
    category: "Business",
    title: "Mini CRM",
    description: "Contacts and a drag-and-drop deal pipeline.",
    prompt:
      "A simple CRM with a contacts list and a kanban-style deal pipeline (Lead, Contacted, Proposal, Won, Lost) that deals can be dragged between.",
    icon: Kanban,
  },
  {
    id: "budget-tracker",
    category: "Personal",
    title: "Budget tracker",
    description: "Categorized spend with monthly charts.",
    prompt:
      "A personal budget tracker with categorized income/expense entries, a monthly summary, and a chart breaking down spend by category.",
    icon: Wallet,
  },
  {
    id: "recipe-box",
    category: "Personal",
    title: "Recipe box",
    description: "Searchable recipes with tags.",
    prompt:
      "A recipe box app for saving recipes with ingredients, steps, tags (cuisine, diet), and a search/filter bar across all saved recipes.",
    icon: BookOpen,
  },
  {
    id: "link-in-bio",
    category: "Personal",
    title: "Link-in-bio page",
    description: "One shareable page for all your links.",
    prompt:
      "A link-in-bio page with a profile photo, name, short bio, and a list of clickable link buttons that can be reordered, plus a simple click-count for each link.",
    icon: Link2,
  },
  {
    id: "trivia-quiz",
    category: "Fun",
    title: "Trivia quiz",
    description: "Timed questions with a score screen.",
    prompt:
      "A trivia quiz game with multiple-choice questions, a countdown timer per question, running score, and a final results screen.",
    icon: Gamepad2,
  },
  {
    id: "pomodoro-timer",
    category: "Fun",
    title: "Pomodoro timer",
    description: "Focus sessions with a session history.",
    prompt:
      "A pomodoro timer with configurable focus/break lengths, a running session, sound on completion, and a history log of past sessions.",
    icon: Timer,
  },
];

export const TEMPLATE_CATEGORIES = ["All", "Productivity", "Business", "Personal", "Fun"] as const;
