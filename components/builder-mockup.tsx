import { Check, FileCode2, Flame, Rocket, Sparkles } from "lucide-react";

const FILES = [
  { name: "app/page.tsx", lines: "128" },
  { name: "components/habit-card.tsx", lines: "64" },
  { name: "lib/streaks.ts", lines: "41" },
];

const HABITS = [
  { name: "Morning run", streak: 12, done: true },
  { name: "Read 20 pages", streak: 5, done: true },
  { name: "Drink 2L water", streak: 21, done: false },
  { name: "No phone after 10pm", streak: 3, done: true },
];

export function BuilderMockup() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-muted/30 shadow-2xl shadow-black/50">
      <div className="flex items-center gap-1.5 border-b border-border px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
        <span className="ml-3 rounded bg-background px-3 py-1 text-xs text-muted-foreground">
          habit-tracker-a4f2.vercel.app
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[280px_1fr]">
        <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Generated with Sonnet 4.5
          </div>
          <p className="text-[13px] leading-relaxed text-foreground/90">
            Built a habit tracker with daily streaks, a calendar view, and
            local persistence.
          </p>
          <div className="mt-4 space-y-1">
            {FILES.map((f) => (
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
            Wired streak logic and a calendar heatmap.
          </div>
          <div className="mt-4 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-foreground text-xs font-medium text-background">
            <Rocket className="h-3.5 w-3.5" />
            Deploy
          </div>
        </div>
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-sm font-medium">Today</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-warning" />
              12 day streak
            </span>
          </div>
          <div className="space-y-2">
            {HABITS.map((h) => (
              <div
                key={h.name}
                className="flex items-center justify-between rounded-lg border border-border bg-background px-3.5 py-2.5"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border ${
                      h.done ? "border-success bg-success/15 text-success" : "border-border text-transparent"
                    }`}
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
                <span
                  key={i}
                  className={`aspect-square rounded-sm ${
                    i % 5 === 4 ? "bg-border" : "bg-success/70"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
