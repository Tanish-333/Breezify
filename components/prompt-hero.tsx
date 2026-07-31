"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Loader2, Paperclip } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { setPendingPrompt } from "@/lib/pending-prompt";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "A habit tracker with streaks and a calendar view",
  "A landing page + waitlist for a SaaS product",
  "An internal dashboard for tracking support tickets",
  "A recipe app with search and saved favorites",
];

export function PromptHero() {
  const router = useRouter();
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit() {
    const trimmed = prompt.trim();
    if (trimmed.length < 5) return;
    setSubmitting(true);
    setPendingPrompt(trimmed);
    router.push(user ? "/build" : "/signup");
  }

  return (
    <div className="w-full max-w-2xl animate-in">
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3 shadow-2xl shadow-black/40 backdrop-blur transition-colors focus-within:border-muted-foreground"
        )}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
          rows={3}
          placeholder="Describe the app you want to build..."
          className="w-full resize-none bg-transparent px-2 pt-1 text-base placeholder:text-muted-foreground focus:outline-none"
        />
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            Attach a screenshot or spec (coming soon)
          </div>
          <button
            onClick={handleSubmit}
            disabled={prompt.trim().length < 5 || submitting}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-85 disabled:opacity-30"
            aria-label="Generate app"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {prompt.trim().length > 0 && prompt.trim().length < 5 && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Add a bit more detail ({prompt.trim().length}/5 characters minimum).
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setPrompt(s)}
            className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
