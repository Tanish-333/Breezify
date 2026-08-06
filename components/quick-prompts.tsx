"use client";

/**
 * Four short generic starter prompts that just prefill the dashboard's
 * composer — deliberately NOT tied to the Templates/duplicate-app system
 * (lib/templates.ts, TemplatesSection). Templates duplicate a real,
 * already-coded app; these are just text nudges for someone staring at a
 * blank prompt box.
 */
const QUICK_PROMPTS = [
  "A habit tracker with streaks and a weekly calendar view",
  "A project management board with columns and drag-and-drop cards",
  "A recipe organizer where I can save, tag, and search recipes",
  "A personal finance tracker for logging expenses by category",
];

export function QuickPrompts({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {QUICK_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          onClick={() => onSelect(prompt)}
          className="rounded-lg border border-border p-3 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
