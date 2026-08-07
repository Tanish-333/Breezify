"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { duplicateTemplateRequest } from "@/lib/api-client";
import { TemplatePreviewDialog } from "@/components/template-preview-dialog";
import { TemplateCover, hasTemplateCover } from "@/components/template-covers";
import { FEATURED_TEMPLATES, TEMPLATE_CATEGORIES, TEMPLATES, type AppTemplate } from "@/lib/templates";
import { DUPLICATE_MIN_PLAN, PLAN_RANK, type PlanId } from "@/lib/types";
import { ArrowRight, Lock } from "lucide-react";

/**
 * One template card. Clicking it only ever opens a preview (see
 * TemplatePreviewDialog) — every template has a real, hand-written static
 * file bundle now (see lib/template-apps/), so the preview is the exact
 * same code you'd get. Duplicating only happens from inside that dialog,
 * never straight from the card.
 */
function TemplateCard({
  template,
  canDuplicate,
  onOpen,
}: {
  template: AppTemplate;
  canDuplicate: boolean;
  onOpen: () => void;
}) {
  const Icon = template.icon;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-hover group relative overflow-hidden rounded-lg border border-border text-left transition-colors hover:border-muted-foreground"
    >
      <div
        className={cn(
          "flex h-20 items-center justify-center overflow-hidden rounded-t-lg bg-gradient-to-br",
          template.gradient
        )}
      >
        {hasTemplateCover(template.id) ? (
          <TemplateCover id={template.id} />
        ) : (
          <Icon className="h-7 w-7 text-foreground/70" strokeWidth={1.25} />
        )}
      </div>
      {!canDuplicate && (
        <Lock className="absolute right-2 top-2 h-3.5 w-3.5 rounded-full bg-background/80 p-0.5 text-muted-foreground" />
      )}
      <div className="p-3">
        <p className="text-sm font-medium">{template.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{template.description}</p>
      </div>
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
  const [previewing, setPreviewing] = useState<AppTemplate | null>(null);
  const [using, setUsing] = useState(false);
  const [error, setError] = useState("");
  const canDuplicate = PLAN_RANK[plan] >= PLAN_RANK[DUPLICATE_MIN_PLAN];

  const visible =
    variant === "featured"
      ? FEATURED_TEMPLATES
      : category === "All"
        ? TEMPLATES
        : TEMPLATES.filter((t) => t.category === category);

  function openPreview(template: AppTemplate) {
    setError("");
    setPreviewing(template);
  }

  async function duplicate() {
    if (!previewing) return;
    setError("");
    setUsing(true);
    try {
      const newId = await duplicateTemplateRequest(previewing.id);
      router.push(`/build/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use this template.");
      setUsing(false);
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

      <div className={cn("grid grid-cols-2 gap-2.5 sm:grid-cols-3", variant === "full" && "mt-3")}>
        {visible.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            canDuplicate={canDuplicate}
            onOpen={() => openPreview(t)}
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

      {previewing && (
        <TemplatePreviewDialog
          template={previewing}
          canDuplicate={canDuplicate}
          using={using}
          error={error}
          onDuplicate={duplicate}
          onClose={() => {
            if (!using) setPreviewing(null);
          }}
        />
      )}
    </div>
  );
}
