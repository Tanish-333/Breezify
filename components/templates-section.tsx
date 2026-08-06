"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { duplicateAppRequest } from "@/lib/api-client";
import { TEMPLATES, TEMPLATE_CATEGORIES, type Template } from "@/lib/templates";
import { DUPLICATE_MIN_PLAN, PLAN_RANK, type PlanId } from "@/lib/types";
import { AlertCircle, Loader2, Lock, Sparkles } from "lucide-react";

// Purely typographic hero — a soft foreground-opacity gradient over the
// existing monochrome palette, no new brand colors, same visual language as
// globals.css' .spotlight wash. Varies slightly by category so the grid
// doesn't read as ten identical tiles.
const HERO_TINT: Record<Template["category"], string> = {
  Productivity: "0.10",
  Business: "0.14",
  Personal: "0.08",
  Fun: "0.18",
};

function TemplateCard({
  template,
  canDuplicate,
  onUseTemplate,
  onFallbackPrompt,
  busy,
}: {
  template: Template;
  canDuplicate: boolean;
  onUseTemplate: (template: Template) => void;
  onFallbackPrompt: (prompt: string) => void;
  busy: boolean;
}) {
  const Icon = template.icon;
  const seeded = !!template.seedAppId;
  const locked = seeded && !canDuplicate;

  return (
    <div className="card-hover flex flex-col overflow-hidden rounded-lg border border-border bg-background">
      <div
        className="relative flex h-24 items-center justify-center border-b border-border bg-muted/30"
        style={{
          backgroundImage: `radial-gradient(60% 80% at 30% 20%, hsl(var(--foreground) / ${HERO_TINT[template.category]}), transparent 70%)`,
        }}
      >
        <Icon className="h-7 w-7 text-foreground/70" strokeWidth={1.25} />
      </div>
      <div className="flex flex-1 flex-col p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {template.category}
        </p>
        <h3 className="mt-1 text-sm font-medium">{template.title}</h3>
        <p className="mt-1 flex-1 text-xs text-muted-foreground">{template.description}</p>

        {locked ? (
          <Link
            href="/billing"
            title={`Upgrade to unlock templates`}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
          >
            <span className="relative inline-flex">
              <Lock className="h-3 w-3" />
            </span>
            Upgrade to use
          </Link>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => (seeded ? onUseTemplate(template) : onFallbackPrompt(template.prompt))}
            className="mt-3 flex items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs font-medium transition-colors hover:border-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {seeded ? "Use this template" : "Start from this prompt"}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The dashboard's primary template surface — a card grid that duplicates a
 * real pre-built app (app/api/apps/duplicate) rather than the older
 * components/template-gallery.tsx, which only prefilled the prompt composer.
 * Kept name "Templates", not "Resources" (Lovable's name for the
 * equivalent section) per product direction.
 *
 * Each card falls back to that same prompt-prefill behavior automatically
 * when its template hasn't been seeded with a real duplicable app yet (see
 * lib/templates.ts's seedAppId doc comment) — so this ships useful today and
 * upgrades itself card-by-card as scripts/seed-templates.ts is run for real.
 */
export function TemplatesSection({
  plan,
  onFallbackPrompt,
}: {
  plan: PlanId;
  onFallbackPrompt: (prompt: string) => void;
}) {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof TEMPLATE_CATEGORIES)[number]>("All");
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const canDuplicate = PLAN_RANK[plan] >= PLAN_RANK[DUPLICATE_MIN_PLAN];

  const visible =
    category === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);

  async function useTemplate(template: Template) {
    if (!template.seedAppId) return;
    setError("");
    setDuplicatingId(template.id);
    try {
      const newAppId = await duplicateAppRequest(template.seedAppId);
      router.push(`/build/${newAppId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start this template.");
      setDuplicatingId(null);
    }
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-base font-medium">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          Templates
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_CATEGORIES.map((c) => (
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
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {visible.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            canDuplicate={canDuplicate}
            onUseTemplate={useTemplate}
            onFallbackPrompt={onFallbackPrompt}
            busy={duplicatingId === t.id}
          />
        ))}
      </div>
    </div>
  );
}
