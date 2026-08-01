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
      "A habit tracker with a list of daily habits, streak counts, and a calendar heatmap showing completion history for the last 3 months.",
    icon: CalendarCheck,
  },
  {
    category: "Productivity",
    title: "Markdown notes",
    description: "Tags, folders, and full-text search",
    prompt:
      "A markdown notes app with a sidebar of notes, tags, folders, live markdown preview, and full-text search across all notes.",
    icon: NotebookPen,
  },
  {
    category: "Business",
    title: "Invoice generator",
    description: "Client list, line items, printable export",
    prompt:
      "An invoice generator with a client list, line items with quantity and price, automatic totals and tax, and a printable/PDF-style invoice preview.",
    icon: Receipt,
  },
  {
    category: "Business",
    title: "Team standup board",
    description: "Async check-ins by day",
    prompt:
      "A team standup board where teammates post async daily check-ins (yesterday/today/blockers), grouped by day, with a simple team member list.",
    icon: Users,
  },
  {
    category: "Business",
    title: "Mini CRM",
    description: "Contacts and a deal pipeline",
    prompt:
      "A simple CRM with a contacts list and a kanban-style deal pipeline (Lead, Contacted, Proposal, Won, Lost) that deals can be dragged between.",
    icon: Kanban,
  },
  {
    category: "Personal",
    title: "Budget tracker",
    description: "Categories and monthly spend charts",
    prompt:
      "A personal budget tracker with categorized income/expense entries, a monthly summary, and a chart breaking down spend by category.",
    icon: Wallet,
  },
  {
    category: "Personal",
    title: "Recipe box",
    description: "Searchable recipes with tags",
    prompt:
      "A recipe box app for saving recipes with ingredients, steps, tags (cuisine, diet), and a search/filter bar across all saved recipes.",
    icon: BookOpen,
  },
  {
    category: "Fun",
    title: "Trivia quiz",
    description: "Timed questions with a score screen",
    prompt:
      "A trivia quiz game with multiple-choice questions, a countdown timer per question, running score, and a final results screen.",
    icon: Gamepad2,
  },
  {
    category: "Fun",
    title: "Pomodoro timer",
    description: "Focus sessions with history",
    prompt:
      "A pomodoro timer with configurable focus/break lengths, a running session, sound on completion, and a history log of past sessions.",
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

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {visible.map((t) => (
          <button
            key={t.title}
            type="button"
            onClick={() => onSelect(t.prompt)}
            className="card-hover flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-muted-foreground"
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
