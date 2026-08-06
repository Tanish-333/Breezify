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
  /** Shown in the dashboard's condensed "Try these" section (components/templates-section.tsx's "featured" variant) — one per category, kept to 4 so the dashboard stays a launch point, not a full catalog. The /templates page always shows all of them regardless of this flag. */
  featured?: boolean;
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
      "A habit tracker. Users create habits with a name, icon, and a target frequency (daily, or specific weekdays). The main screen lists today's habits with a one-tap toggle to mark each done, showing the current streak and longest streak per habit. Below that, a calendar heatmap (like GitHub's contribution graph) for the last 3 months, colored by how many habits were completed that day, with a click on any day showing which habits were done. Include a simple stats panel with overall completion rate for the last 7/30 days. Habits can be edited, archived, or deleted without losing their history.",
    icon: CalendarCheck,
    gradient: "from-foreground/[0.06] via-muted to-background",
    featured: true,
  },
  {
    id: "markdown-notes",
    category: "Productivity",
    title: "Markdown notes",
    description: "Tags, folders, and full-text search",
    prompt:
      "A markdown notes app. Left sidebar lists notes grouped by folder, with folders creatable/renamable/deletable and notes draggable between them; each note also has freeform tags shown as chips. The main panel is a split view: a markdown textarea on the left and a live-rendered preview (headings, bold/italic, lists, code blocks, links) on the right, toggleable to preview-only on narrow screens. A search bar at the top does full-text search across note titles and bodies, plus filtering by tag. Notes autosave as you type (debounced) and show a 'last edited' timestamp. Include a way to pin favorite notes to the top of the sidebar.",
    icon: NotebookPen,
    gradient: "from-foreground/[0.08] via-muted to-background",
  },
  {
    id: "invoice-generator",
    category: "Business",
    title: "Invoice generator",
    description: "Client list, line items, printable export",
    prompt:
      "An invoice generator. A clients section stores name, email, and billing address, reusable across invoices. Creating an invoice lets you pick a client, add line items (description, quantity, unit price) with an editable tax rate, and see subtotal, tax, and total computed live as you edit. Each invoice gets a sequential invoice number and a status (draft, sent, paid, overdue) that can be changed from the invoice list. A print-friendly invoice preview lays out a clean header (your business name, client, invoice number, date, due date), the line-item table, and totals, formatted for a browser 'Print to PDF'. Include a dashboard view listing all invoices with client, total, status, and due date, filterable by status.",
    icon: Receipt,
    gradient: "from-foreground/[0.05] via-background to-muted",
    featured: true,
  },
  {
    id: "team-standup",
    category: "Business",
    title: "Team standup board",
    description: "Async check-ins by day",
    prompt:
      "A team standup board. A team members list (name, avatar initial, role) that anyone can add to. Each day, team members post an async check-in with three fields: what I did yesterday, what I'm doing today, and any blockers. The main view groups check-ins by day (today expanded by default, past days collapsible), showing each member's post as a card with their name and timestamp. Blockers are visually flagged (e.g. a colored border or badge) and there's a filter to show only posts with blockers. Include a simple streak indicator per member for consecutive days checked in, and a way to edit or delete your own check-in for the current day.",
    icon: Users,
    gradient: "from-foreground/[0.07] via-background to-muted",
  },
  {
    id: "mini-crm",
    category: "Business",
    title: "Mini CRM",
    description: "Contacts and a deal pipeline",
    prompt:
      "A mini CRM. A contacts list stores name, company, email, phone, and freeform notes, each contact linkable to one or more deals. A kanban board has columns Lead, Contacted, Proposal, Won, Lost; each deal is a card showing its linked contact, deal name, and dollar value, draggable between columns to update its stage. Clicking a deal opens a detail panel with an editable value, expected close date, and a running log of notes/activity you can append to over time. The top of the board shows total pipeline value and total won value, updating live as deals move. Include a simple search across contacts and deals by name or company.",
    icon: Kanban,
    gradient: "from-foreground/[0.09] via-background to-muted",
  },
  {
    id: "budget-tracker",
    category: "Personal",
    title: "Budget tracker",
    description: "Categories and monthly spend charts",
    prompt:
      "A personal budget tracker. Add income or expense entries with an amount, category (from an editable list like Groceries, Rent, Transport, Entertainment, Income), date, and optional note. A monthly view defaults to the current month with prev/next month navigation, showing total income, total expenses, and net for that month at the top. A pie or bar chart breaks down expenses by category for the selected month, and a scrollable transaction list below shows every entry, editable and deletable, sortable by date or amount. Include a simple monthly budget limit per category that shows a progress bar (and turns red when exceeded) comparing spend so far to the limit.",
    icon: Wallet,
    gradient: "from-foreground/[0.06] via-muted to-background",
    featured: true,
  },
  {
    id: "recipe-box",
    category: "Personal",
    title: "Recipe box",
    description: "Searchable recipes with tags",
    prompt:
      "A recipe box app. Each recipe has a title, optional photo, a list of ingredients (with quantity), numbered steps, prep/cook time, servings, and tags for cuisine (e.g. Italian, Mexican) and diet (e.g. Vegetarian, Vegan, Gluten-free). The main view is a grid of recipe cards showing photo, title, and tags, with a search bar that matches title and ingredients, plus filter chips for cuisine and diet that combine with the search. Clicking a recipe opens a full detail view with a servings adjuster that scales ingredient quantities live, and a checklist-style view of steps you can tick off while cooking. Include a favorites toggle on each recipe and a filter to show only favorites.",
    icon: BookOpen,
    gradient: "from-foreground/[0.08] via-muted to-background",
  },
  {
    id: "link-in-bio",
    category: "Personal",
    title: "Link-in-bio page",
    description: "One clean page for all your links",
    prompt:
      "A personal link-in-bio page. A public-facing page shows a profile photo, display name, short bio, and a vertical stack of clickable link buttons (label + URL + optional icon), styled like a typical link-in-bio page with a centered card on a simple background. A separate settings/editor screen (behind a basic password or just a distinct route) lets the owner edit their photo, name, bio, and add/reorder/remove/edit links via drag-and-drop, with changes reflected immediately on the public page. Track a simple click count per link, shown only in the editor, incrementing whenever a visitor clicks that link on the public page. Support at least one alternate color theme selectable in the editor.",
    icon: Link2,
    gradient: "from-foreground/[0.05] via-muted to-background",
  },
  {
    id: "trivia-quiz",
    category: "Fun",
    title: "Trivia quiz",
    description: "Timed questions with a score screen",
    prompt:
      "A trivia quiz game. Start screen lets the player pick a category (e.g. General, Science, History, Movies) and question count (5/10/15), then ships with a bank of at least 40 multiple-choice questions across those categories (4 answer options each, one correct) built into the app. Each question has a 15-second countdown timer shown as a shrinking bar; answering locks in a choice (correct flashes green, wrong flashes red and reveals the correct one), and running out of time counts as wrong. A running score and question progress (e.g. 'Question 4 of 10') show throughout. The final results screen shows the score, percentage correct, and a per-question review of what was answered vs. correct, with a 'play again' button that reshuffles questions.",
    icon: Gamepad2,
    gradient: "from-foreground/[0.07] via-background to-muted",
    featured: true,
  },
  {
    id: "pomodoro-timer",
    category: "Fun",
    title: "Pomodoro timer",
    description: "Focus sessions with history",
    prompt:
      "A pomodoro timer. Configurable focus length, short-break length, long-break length, and how many focus sessions before a long break (defaults 25/5/15/4, editable in settings). A large countdown display shows the current session's remaining time and whether it's a focus or break session, with start/pause/reset controls and automatic transition to the next session (focus -> short break -> focus -> ... -> long break) once time runs out, playing a short sound/beep on each transition. An optional task name field lets the user label what they're focusing on for the current session. A history log lists completed focus sessions with their task label, date, and duration, plus a simple daily total (e.g. total focused minutes today).",
    icon: Timer,
    gradient: "from-foreground/[0.09] via-background to-muted",
  },
];

export const TEMPLATE_CATEGORIES = ["All", "Productivity", "Business", "Personal", "Fun"] as const;

/** One per category — see AppTemplate.featured's doc comment. */
export const FEATURED_TEMPLATES = TEMPLATES.filter((t) => t.featured);
