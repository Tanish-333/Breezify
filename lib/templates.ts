import type { LucideIcon } from "lucide-react";
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
} from "lucide-react";

export type TemplateCategory = "Productivity" | "Business" | "Personal" | "Fun";

export interface AppTemplate {
  /** Stable slug, stamped as templateSlug on the real app app/api/admin/seed-templates generates for this one — see lib/use-apps.ts' useTemplateApps(), which maps this back to a real appId at runtime. */
  id: string;
  category: TemplateCategory;
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
  /** Tailwind classes for the card's hero — a flat gradient, not a screenshot (see app/globals.css' monochrome palette; no new brand colors here). */
  gradient: string;
}

// Same 9 prompts components/template-gallery.tsx already used (kept there
// as a fallback/reference), plus one to round out the category spread —
// every other category had a "make a page for yourself" angle except
// Personal, which skewed utility (budget/recipes); a link-in-bio fits that
// gap and is a genuinely common first request.
export const TEMPLATES: AppTemplate[] = [
  {
    id: "habit-tracker",
    category: "Productivity",
    title: "Habit tracker",
    description: "Daily streaks and a calendar heatmap",
    prompt:
      "A habit tracker with a list of daily habits, streak counts, and a calendar heatmap showing completion history for the last 3 months.",
    icon: CalendarCheck,
    gradient: "from-foreground/[0.06] via-muted to-background",
  },
  {
    id: "markdown-notes",
    category: "Productivity",
    title: "Markdown notes",
    description: "Tags, folders, and full-text search",
    prompt:
      "A markdown notes app with a sidebar of notes, tags, folders, live markdown preview, and full-text search across all notes.",
    icon: NotebookPen,
    gradient: "from-foreground/[0.08] via-muted to-background",
  },
  {
    id: "invoice-generator",
    category: "Business",
    title: "Invoice generator",
    description: "Client list, line items, printable export",
    prompt:
      "An invoice generator with a client list, line items with quantity and price, automatic totals and tax, and a printable/PDF-style invoice preview.",
    icon: Receipt,
    gradient: "from-foreground/[0.05] via-background to-muted",
  },
  {
    id: "team-standup",
    category: "Business",
    title: "Team standup board",
    description: "Async check-ins by day",
    prompt:
      "A team standup board where teammates post async daily check-ins (yesterday/today/blockers), grouped by day, with a simple team member list.",
    icon: Users,
    gradient: "from-foreground/[0.07] via-background to-muted",
  },
  {
    id: "mini-crm",
    category: "Business",
    title: "Mini CRM",
    description: "Contacts and a deal pipeline",
    prompt:
      "A simple CRM with a contacts list and a kanban-style deal pipeline (Lead, Contacted, Proposal, Won, Lost) that deals can be dragged between.",
    icon: Kanban,
    gradient: "from-foreground/[0.09] via-background to-muted",
  },
  {
    id: "budget-tracker",
    category: "Personal",
    title: "Budget tracker",
    description: "Categories and monthly spend charts",
    prompt:
      "A personal budget tracker with categorized income/expense entries, a monthly summary, and a chart breaking down spend by category.",
    icon: Wallet,
    gradient: "from-foreground/[0.06] via-muted to-background",
  },
  {
    id: "recipe-box",
    category: "Personal",
    title: "Recipe box",
    description: "Searchable recipes with tags",
    prompt:
      "A recipe box app for saving recipes with ingredients, steps, tags (cuisine, diet), and a search/filter bar across all saved recipes.",
    icon: BookOpen,
    gradient: "from-foreground/[0.08] via-muted to-background",
  },
  {
    id: "link-in-bio",
    category: "Personal",
    title: "Link-in-bio page",
    description: "One clean page for all your links",
    prompt:
      "A personal link-in-bio page with a profile photo, short bio, and a list of clickable link buttons, editable from a simple settings screen.",
    icon: Link2,
    gradient: "from-foreground/[0.05] via-muted to-background",
  },
  {
    id: "trivia-quiz",
    category: "Fun",
    title: "Trivia quiz",
    description: "Timed questions with a score screen",
    prompt:
      "A trivia quiz game with multiple-choice questions, a countdown timer per question, running score, and a final results screen.",
    icon: Gamepad2,
    gradient: "from-foreground/[0.07] via-background to-muted",
  },
  {
    id: "pomodoro-timer",
    category: "Fun",
    title: "Pomodoro timer",
    description: "Focus sessions with history",
    prompt:
      "A pomodoro timer with configurable focus/break lengths, a running session, sound on completion, and a history log of past sessions.",
    icon: Timer,
    gradient: "from-foreground/[0.09] via-background to-muted",
  },
];

export const TEMPLATE_CATEGORIES = ["All", "Productivity", "Business", "Personal", "Fun"] as const;
