"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { duplicateAppRequest } from "@/lib/api-client";
import { useTemplateApps } from "@/lib/use-apps";
import { TEMPLATE_CATEGORIES, TEMPLATES, type AppTemplate } from "@/lib/templates";
import { DUPLICATE_MIN_PLAN, PLAN_RANK, type PlanId } from "@/lib/types";
import { AlertCircle, Loader2, Lock } from "lucide-react";

/**
 * One template card. A seeded template (its slug found in `seededAppId`)
 * duplicates a real pre-built app via the existing Pro+ duplicate flow; an
 * unseeded one falls back to prefilling the composer, same as the plain
 * prompt gallery this replaces, so the section is fully usable before
 * app/api/admin/seed-templates has been run against a live deployment.
 */
function TemplateCard({
  template,
  seededAppId,
  canDuplicate,
  using,
  onUse,
}: {
  template: AppTemplate;
  seededAppId: string | undefined;
  canDuplicate: boolean;
  using: boolean;
  onUse: () => void;
}) {
  const Icon = template.icon;
  const locked = !!seededAppId && !canDuplicate;

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

  if (locked) {
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
  onSelectPrompt,
}: {
  plan: PlanId;
  /** Fallback for a template that hasn't been seeded yet — prefills the composer instead, same as the plain prompt gallery this replaces. */
  onSelectPrompt: (prompt: string) => void;
}) {
  const router = useRouter();
  const { bySlug: seededApps } = useTemplateApps();
  const [category, setCategory] = useState<(typeof TEMPLATE_CATEGORIES)[number]>("All");
  const [usingId, setUsingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const canDuplicate = PLAN_RANK[plan] >= PLAN_RANK[DUPLICATE_MIN_PLAN];

  const visible =
    category === "All" ? TEMPLATES : TEMPLATES.filter((t) => t.category === category);

  async function applyTemplate(template: AppTemplate) {
    setError("");
    const seededAppId = seededApps[template.id];
    if (!seededAppId) {
      onSelectPrompt(template.prompt);
      return;
    }
    setUsingId(template.id);
    try {
      const newId = await duplicateAppRequest(seededAppId);
      router.push(`/build/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't use this template.");
      setUsingId(null);
    }
  }

  return (
    <div>
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

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {visible.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            seededAppId={seededApps[t.id]}
            canDuplicate={canDuplicate}
            using={usingId === t.id}
            onUse={() => applyTemplate(t)}
          />
        ))}
      </div>
    </div>
  );
}
