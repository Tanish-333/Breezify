"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  CalendarCheck,
  Receipt,
  Users,
  Wallet,
  BookOpen,
  Gamepad2,
  Timer,
  NotebookPen,
  Kanban,
  type LucideIcon,
} from "lucide-react";

interface Template {
  category: "Productivity" | "Business" | "Personal" | "Fun";
  title: string;
  description: string;
  prompt: string;
  icon: LucideIcon;
}

const TEMPLATES: Template[] = [
  {
    category: "Productivity",
    title: "Habit tracker",
    description: "Daily streaks and a calendar heatmap",
    prompt:
      "A habit tracker, styled like a calm, focused productivity tool (soft neutral background, one confident accent color for completed states). Left column: a list of habits, each as a card showing its name, current streak with a small flame/streak icon, and a one-tap toggle to mark today done. Right column: a GitHub-style calendar heatmap of the last 3 months per selected habit, with intensity shading by completion, plus a stats row (current streak, longest streak, completion rate). Include an 'Add habit' flow with a name and color picker, a real empty state for a brand-new account with zero habits, and smooth micro-animations when a habit is checked off.",
    icon: CalendarCheck,
  },
  {
    category: "Productivity",
    title: "Markdown notes",
    description: "Tags, folders, and full-text search",
    prompt:
      "A markdown notes app styled like a polished writing tool (generous whitespace, a serif or editorial font for the note content, sans-serif UI chrome). Left sidebar: collapsible folder tree, tag filter pills, and a search box that does live full-text search across all notes as you type. Main area: a split view with a markdown editor on one side and a live-rendered preview on the other (or a toggle on mobile). Top bar: note title, last-edited timestamp, folder/tag assignment. Include a real empty state for a new user, smooth transitions when switching notes, and keyboard shortcut hints (Cmd/Ctrl+N for new note, Cmd/Ctrl+F for search).",
    icon: NotebookPen,
  },
  {
    category: "Business",
    title: "Invoice generator",
    description: "Client list, line items, printable export",
    prompt:
      "An invoice generator styled like real business software (clean, trustworthy, lots of whitespace, one accent color, tabular numbers for money). Left: a client list with name, email, and outstanding balance. Main: an invoice builder — client picker, line items table (description, quantity, unit price, computed line total) with add/remove rows, automatic subtotal/tax/total calculation, due date, and invoice number. Include a distinct print-optimized invoice preview (looks like an actual printable/PDF invoice, not the editor UI) reachable via a 'Preview' action, plus a status badge (Draft/Sent/Paid) and an empty state before any clients exist.",
    icon: Receipt,
  },
  {
    category: "Business",
    title: "Team standup board",
    description: "Async check-ins by day",
    prompt:
      "An async team standup board styled like a clean internal tool (neutral palette, one accent color for the current day, avatar initials as colored circles). A day selector across the top (defaulting to today) with a simple team member list in a sidebar. Main area: each teammate's check-in as a card with three clearly labeled sections — Yesterday, Today, Blockers — editable inline, with blockers visually flagged (e.g. a warning-colored left border) when present. Include a 'Post check-in' flow, a real empty state for days with no check-ins yet, and a way to browse previous days.",
    icon: Users,
  },
  {
    category: "Business",
    title: "Mini CRM",
    description: "Contacts and a deal pipeline",
    prompt:
      "A mini CRM styled like a modern sales tool (crisp neutral UI, one accent color for money/won states). Contacts view: a searchable, sortable table with name, company, email, and last-contacted date, opening a detail panel per contact. Pipeline view: a kanban board with columns for Lead, Contacted, Proposal, Won, Lost, each deal as a draggable card showing deal name, value, and contact; dragging between columns updates status with a smooth animation, and each column shows a running total value. Include empty states for a fresh pipeline, an 'Add deal'/'Add contact' flow, and a small dashboard header summarizing total pipeline value and deal count.",
    icon: Kanban,
  },
  {
    category: "Personal",
    title: "Budget tracker",
    description: "Categories and monthly spend charts",
    prompt:
      "A personal budget tracker styled like a calm personal-finance app (soft neutral background, restrained accent color, tabular numbers, no clutter). Top: a monthly summary card showing total income, total expenses, and net, with a month switcher. Middle: a donut or bar chart breaking down expenses by category with a matching color-coded legend. Bottom: a categorized, filterable transaction list (date, description, category tag, amount, income shown in a distinct color from expenses) with an 'Add transaction' form. Include a real empty state for a brand-new month with nothing logged yet.",
    icon: Wallet,
  },
  {
    category: "Personal",
    title: "Recipe box",
    description: "Searchable recipes with tags",
    prompt:
      "A recipe box app styled like a warm, editorial cooking site (inviting typography, generous image/placeholder space, soft rounded cards). A responsive grid of recipe cards (title, cuisine/diet tags as pills, prep time) with a search bar and tag filters up top. Recipe detail view: ingredients list with checkable items, numbered step-by-step instructions, and tag/cuisine badges. Include an 'Add recipe' form (ingredients as a repeatable list, steps as a repeatable list, tag picker), a real empty state before any recipes are saved, and a pleasant hover state on recipe cards.",
    icon: BookOpen,
  },
  {
    category: "Fun",
    title: "Trivia quiz",
    description: "Timed questions with a score screen",
    prompt:
      "A trivia quiz game styled like a fun, energetic game show (bold accent color, playful but clean typography, satisfying transitions). Start screen with a category/difficulty pick and a 'Start' call to action. Question screen: the question, four answer options as large tappable cards, a visible countdown timer bar that drains over the question's time limit, and immediate color feedback (correct/incorrect) before advancing. Running score visible throughout. Final results screen: final score, an accuracy stat, and a 'Play again' action, with a small celebratory animation for a high score.",
    icon: Gamepad2,
  },
  {
    category: "Fun",
    title: "Pomodoro timer",
    description: "Focus sessions with history",
    prompt:
      "A pomodoro focus timer styled like a minimal, distraction-free tool (large centered typography, one calm accent color, huge readable countdown). Center stage: a large circular or bar progress ring showing time remaining in the current focus/break session, with clear play/pause/reset controls. Settings panel to configure focus length, short break, and long break durations, and toggle a completion sound. A session history log below (or in a side panel) listing completed sessions by date/time with total focused time for today. Smooth visual/color transition when switching between focus and break modes.",
    icon: Timer,
  },
];

const CATEGORIES = ["All", "Productivity", "Business", "Personal", "Fun"] as const;

export function TemplateGallery({ onSelect }: { onSelect: (prompt: string) => void }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const visible =
    category === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-1.5">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              category === c
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      {/* flex-wrap, not a fixed 2-column grid: a grid stretches a lone
          trailing card (an odd total, or an odd count within a filtered
          category) to fill one column while leaving the other empty beside
          it — a big awkward gap. Wrapping lets a trailing card sit at its
          natural width instead. */}
      <div className="mt-3 flex flex-wrap gap-2">
        {visible.map((t) => (
          <button
            key={t.title}
            type="button"
            onClick={() => onSelect(t.prompt)}
            className="card-hover flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-muted-foreground sm:w-[calc(50%-0.25rem)]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
              <t.icon className="h-4 w-4" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">{t.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
