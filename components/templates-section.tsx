"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { duplicateTemplateRequest } from "@/lib/api-client";
import { FEATURED_TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATES, type AppTemplate } from "@/lib/templates";
import { DUPLICATE_MIN_PLAN, PLAN_RANK, type PlanId } from "@/lib/types";
import { AlertCircle, ArrowRight, Loader2, Lock } from "lucide-react";

/**
 * One template card. Every template has a real, hand-written static file
 * bundle now (see lib/template-apps/), so there's no more "seeded vs. not"
 * distinction — the only thing that decides whether a card is a real,
 * clickable duplicate action or a plan-locked upsell is the viewer's own
 * plan, checked server-side by app/api/apps/from-template.
 */
function TemplateCard({
  template,
  canDuplicate,
  using,
  onUse,
}: {
  template: AppTemplate;
  canDuplicate: boolean;
  using: boolean;
  onUse: () => void;
}) {
  const Icon = template.icon;

  const hero = (
    <div
      className={cn(
        "flex h-20 items-center justify-center rounded-t-lg bg-gradient-to-br",
        template.gradient
      )}
    >
      <Icon className="h-7 w-7 text-foreground/70" strokeWidth={1.25} />
    </div>
  );

  const body = (
    <div className="p-3">
      <p className="text-sm font-medium">{template.title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
    </div>
  );

  if (!canDuplicate) {
    return (
      <Link
        href="/billing"
        title={`Upgrade to duplicate — templates use the same ${DUPLICATE_MIN_PLAN}+ duplicate flow as any other app`}
        className="card-hover group relative overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-muted-foreground"
      >
        {hero}
        <Lock className="absolute right-2 top-2 h-3.5 w-3.5 rounded-full bg-background/80 p-0.5 text-muted-foreground" />
        {body}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onUse}
      disabled={using}
      className="card-hover relative overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-muted-foreground disabled:opacity-60"
    >
      {hero}
      {using && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {body}
    </button>
  );
}

export function TemplatesSection({
  plan,
  variant = "full",
}: {
  plan: PlanId;
  /**
   * "featured" is the dashboard's condensed "Try these" section: 4 cards
   * (one per category, see FEATURED_TEMPLATES), no category filter, and a
   * link to the full /templates page. "full" is that page itself: every
   * template, with the category filter. Defaults to "full" since the
   * dedicated page is this component's primary home now.
   */
  variant?: "full" | "featured";
}) {
  const router = useRouter();
  const [category, setCategory] = useState<(typeof TEMPLATE_CATEGORIES)[number]>("All");
  const [usingId, setUsingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const canDuplicate = PLAN_RANK[plan] >= PLAN_RANK[DUPLICATE_MIN_PLAN];

  const visible =
    variant === "featured"
      ? FEATURED_TEMPLATES
      : category === "All"
        ? TEMPLATES
        : TEMPLATES.filter((t) => t.category === category);

  async function applyTemplate(template: AppTemplate) {
    setError("");
    setUsingId(template.id);
    try {
      const newId = await duplicateTemplateRequest(template.id);
      router.push(`/build/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use this template.");
      setUsingId(null);
    }
  }

  return (
    <div>
      {variant === "full" && (
        <div className="flex flex-wrap justify-center gap-1.5">
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
      )}

      {error && (
        <div className={cn("flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error", variant === "full" && "mt-3")}>
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3", variant === "full" && "mt-3")}>
        {visible.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            canDuplicate={canDuplicate}
            using={usingId === t.id}
            onUse={() => applyTemplate(t)}
          />
        ))}
      </div>

      {variant === "featured" && (
        <div className="mt-3 text-center">
          <Link
            href="/templates"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            See all templates
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
