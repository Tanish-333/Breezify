import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarCheck,
  CalendarClock,
  Clapperboard,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Gamepad2,
  Kanban,
  Link2,
  NotebookPen,
  Receipt,
  Timer,
  Trophy,
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

// 16 templates, 4 per category — grown from an original 9
// (components/template-gallery.tsx keeps those same prompts as a
// fallback/reference) via link-in-bio (rounded Personal out to match the
// other categories) and, later, six more (day-planner, meeting-notes,
// expense-tracker, workout-log, watchlist, bucket-list) to bring every
// category to an even 4.
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
    id: "day-planner",
    category: "Productivity",
    title: "Day planner",
    description: "A time-blocked daily schedule",
    prompt:
      "A day planner with a vertical 24-hour timeline. Clicking anywhere on the timeline opens a form to add a time block there (title, start/end time, category: Work, Personal, Health, or Other), snapping to 15-minute increments; each block renders positioned and sized by its actual time, color-coded by category. Clicking an existing block opens the same form to edit or delete it. A header lets the user navigate to the previous day, next day, or jump back to today, showing how many blocks are scheduled. Persist a separate schedule per calendar day so past and future days keep their own blocks.",
    icon: CalendarClock,
    gradient: "from-foreground/[0.07] via-muted to-background",
  },
  {
    id: "meeting-notes",
    category: "Productivity",
    title: "Meeting notes",
    description: "Agendas, notes, and action items",
    prompt:
      "A meeting notes app with a sidebar listing past meetings (searchable across title, notes, and attendees) and a 'new meeting' button. Each meeting has a title, date, a chip-style attendee list (type a name, press Enter to add), a freeform agenda field, a freeform notes field, and a checklist of action items — each item has text, an owner, an optional due date, and a done toggle. The sidebar shows how many action items are still open per meeting. Everything autosaves as it's edited, with no explicit save button.",
    icon: ClipboardList,
    gradient: "from-foreground/[0.09] via-background to-muted",
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
    id: "expense-tracker",
    category: "Business",
    title: "Expense reports",
    description: "Submit, approve, and reimburse expenses",
    prompt:
      "An expense report tracker. Line items (date, category — Travel/Meals/Supplies/Software/Other —, description, amount) are grouped into reports with a running total. A report moves through statuses: draft (line items are still editable), submitted, approved, reimbursed, or rejected (sent back to draft to revise and resubmit) — buttons to move a report between these appear based on its current status. A dashboard lists every report with its total and status, plus summary stats: total reports, total pending reimbursement, and total reimbursed.",
    icon: CreditCard,
    gradient: "from-foreground/[0.06] via-muted to-background",
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
    id: "workout-log",
    category: "Personal",
    title: "Workout log",
    description: "Sets, reps, and progress over time",
    prompt:
      "A workout log. Starting a workout creates an entry for today (or reopens today's if one already exists); each workout holds a list of exercises added by name, and each exercise holds a list of sets (reps + optional weight) logged one at a time. A progress view lets the user pick any exercise they've logged and see a line chart of their best set's weight per workout over time. A stats row shows the current streak of consecutive days trained, workouts logged in the last 7 days, and total workouts. Workout history is browsable by date.",
    icon: Dumbbell,
    gradient: "from-foreground/[0.08] via-background to-muted",
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
  {
    id: "watchlist",
    category: "Fun",
    title: "Movie & TV watchlist",
    description: "Track what to watch and what you loved",
    prompt:
      "A movie and TV watchlist. Add a title with its type (Movie or TV Show), freeform genre tags, and a status (Want to watch, Watching, or Completed); once marked Completed, a 5-star rating and notes become available. The main view is a responsive card grid, each card showing a color-coded placeholder header (no image upload needed), title, type, status, and rating if rated. Include a search bar (matches title and genres) and filter pills for status. Clicking a card opens it for editing or removal.",
    icon: Clapperboard,
    gradient: "from-foreground/[0.05] via-muted to-background",
  },
  {
    id: "bucket-list",
    category: "Fun",
    title: "Bucket list",
    description: "Life goals, tracked and celebrated",
    prompt:
      "A bucket list app. Each goal has a title, an optional description, a category (Travel, Adventure, Skill, Experience, Other), and an optional target date. A header shows overall progress as a count and percentage of goals completed, with a colorful progress bar. One tap marks a goal complete, stamping the date it was finished; completed goals move to the bottom of the list with a struck-through title. Filter the list by category. Adding, editing, and deleting goals all happen through a simple form.",
    icon: Trophy,
    gradient: "from-foreground/[0.07] via-muted to-background",
  },
];

export const TEMPLATE_CATEGORIES = ["All", "Productivity", "Business", "Personal", "Fun"] as const;

/** One per category — see AppTemplate.featured's doc comment. */
export const FEATURED_TEMPLATES = TEMPLATES.filter((t) => t.featured);
