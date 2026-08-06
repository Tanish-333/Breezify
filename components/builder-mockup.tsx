"use client";

import { useEffect, useState } from "react";
import { Check, FileCode2, Flame, Rocket, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const ROTATE_MS = 4500;

interface Example {
  model: string;
  summary: string;
  files: { name: string; lines: string }[];
  note: string;
  panel: React.ReactNode;
}

function HabitPanel() {
  const habits = [
    { name: "Morning run", streak: 12, done: true },
    { name: "Read 20 pages", streak: 5, done: true },
    { name: "Drink 2L water", streak: 21, done: false },
    { name: "No phone after 10pm", streak: 3, done: true },
  ];
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-medium">Today</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Flame className="h-3.5 w-3.5 text-warning" />
          12 day streak
        </span>
      </div>
      <div className="space-y-2">
        {habits.map((h) => (
          <div
            key={h.name}
            className="flex items-center justify-between rounded-lg border border-border bg-background px-3.5 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-[18px] w-[18px] items-center justify-center rounded-full border",
                  h.done ? "border-success bg-success/15 text-success" : "border-border text-transparent"
                )}
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <span className="text-sm">{h.name}</span>
            </div>
            <span className="text-xs text-muted-foreground">{h.streak}d</span>
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-lg border border-border bg-background p-4">
        <div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>This month</span>
          <span>24/30 days</span>
        </div>
        <div className="grid grid-cols-10 gap-1">
          {Array.from({ length: 30 }).map((_, i) => (
            <span key={i} className={cn("aspect-square rounded-sm", i % 5 === 4 ? "bg-border" : "bg-success/70")} />
          ))}
        </div>
      </div>
    </>
  );
}

function DashboardPanel() {
  const bars = [40, 65, 52, 78, 60, 90, 71];
  const orders = [
    { id: "#3021", customer: "A. Rivera", amount: "$128.00" },
    { id: "#3020", customer: "J. Chen", amount: "$64.50" },
    { id: "#3019", customer: "M. Osei", amount: "$212.00" },
  ];
  return (
    <>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: "Revenue", value: "$18.2k" },
          { label: "Orders", value: "342" },
          { label: "Avg. order", value: "$53.20" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-lg font-semibold tracking-tight">{s.value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-border bg-background p-4">
        <p className="mb-3 text-xs text-muted-foreground">Revenue this week</p>
        <div className="flex h-24 items-end gap-2">
          {bars.map((h, i) => (
            <div key={i} className="flex-1 rounded-t-sm bg-success/70" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-1.5">
        {orders.map((o) => (
          <div
            key={o.id}
            className="flex items-center justify-between rounded-lg border border-border bg-background px-3.5 py-2.5 text-xs"
          >
            <span className="font-mono text-muted-foreground">{o.id}</span>
            <span>{o.customer}</span>
            <span className="font-medium">{o.amount}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function KanbanPanel() {
  const columns = [
    { title: "To do", cards: ["Design onboarding", "Draft pricing copy"] },
    { title: "In progress", cards: ["API rate limiting", "Invite flow"] },
    { title: "Done", cards: ["Auth", "Dashboard layout"] },
  ];
  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-medium">Sprint board</span>
        <span className="text-xs text-muted-foreground">6 tasks</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {columns.map((col) => (
          <div key={col.title} className="rounded-lg border border-border bg-background p-2.5">
            <p className="mb-2 text-[11px] font-medium text-muted-foreground">{col.title}</p>
            <div className="space-y-1.5">
              {col.cards.map((c) => (
                <div
                  key={c}
                  className="rounded-md border border-border bg-muted/30 px-2 py-2 text-[11px] leading-snug"
                >
                  {c}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

const EXAMPLES: Example[] = [
  {
    model: "Generated with Sonnet 4.5",
    summary: "Built a habit tracker with daily streaks, a calendar view, and local persistence.",
    files: [
      { name: "app/page.tsx", lines: "128" },
      { name: "components/habit-card.tsx", lines: "64" },
      { name: "lib/streaks.ts", lines: "41" },
    ],
    note: "Wired streak logic and a calendar heatmap.",
    panel: <HabitPanel />,
  },
  {
    model: "Generated with Opus 5",
    summary: "Built a sales dashboard with live revenue charts, order history, and summary stats.",
    files: [
      { name: "app/page.tsx", lines: "156" },
      { name: "components/revenue-chart.tsx", lines: "72" },
      { name: "lib/orders.ts", lines: "38" },
    ],
    note: "Wired the revenue chart and recent-orders table.",
    panel: <DashboardPanel />,
  },
  {
    model: "Generated with Haiku 4.5",
    summary: "Built a project board with drag-friendly columns and per-task status.",
    files: [
      { name: "app/page.tsx", lines: "94" },
      { name: "components/board-column.tsx", lines: "58" },
      { name: "lib/tasks.ts", lines: "27" },
    ],
    note: "Wired the three-column sprint board.",
    panel: <KanbanPanel />,
  },
];

export function BuilderMockup() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % EXAMPLES.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const example = EXAMPLES[index];

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-muted/30 shadow-2xl shadow-black/50">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-3 rounded bg-background px-3 py-1 text-xs text-muted-foreground">
          Live preview
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          {EXAMPLES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              aria-label={`Show example ${i + 1}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index ? "w-4 bg-foreground" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>
      </div>
      <div key={index} className="animate-in grid grid-cols-1 sm:grid-cols-[280px_1fr]">
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            {example.model}
          </div>
          <p className="text-[13px] leading-relaxed text-foreground/90">{example.summary}</p>
          <div className="mt-4 space-y-1">
            {example.files.map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground"
              >
                <span className="flex items-center gap-1.5 truncate">
                  <FileCode2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate font-mono">{f.name}</span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/60">{f.lines}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-1.5 rounded-lg border border-border p-3 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 shrink-0" />
            {example.note}
          </div>
          <div className="mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-xs font-medium text-background">
            <Rocket className="h-3.5 w-3.5" />
            Deploy
          </div>
        </div>
        <div className="p-6">{example.panel}</div>
      </div>
    </div>
  );
}
