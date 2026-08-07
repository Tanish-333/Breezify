"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  MODEL_IDS,
  MODEL_INFO,
  planAllowsModel,
  requiredPlanFor,
  type ModelId,
  type PlanId,
} from "@/lib/types";
import { Check, Lock } from "lucide-react";

export function ModelSelector({
  value,
  onChange,
  plan,
  availability,
  onLockedNavigate,
  disabled,
}: {
  value: ModelId;
  onChange: (model: ModelId) => void;
  plan: PlanId;
  availability?: Record<string, boolean>;
  /** Called just before navigating to /billing from a locked model card, so the caller can save any in-progress draft (e.g. the prompt) first. */
  onLockedNavigate?: () => void;
  /** True while a generation using `value` is already in flight — switching models mid-request wouldn't affect that request, but leaving the picker live makes the cost/model shown look like it applies to work that's already running. */
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {MODEL_IDS.map((id) => {
        const info = MODEL_INFO[id];
        const unlocked = planAllowsModel(plan, id);
        // Availability is unknown until the fetch resolves; assume usable so
        // models don't flash as "unavailable" on first paint.
        const configured = availability ? availability[id] !== false : true;
        const usable = unlocked && configured && !disabled;
        const active = value === id && unlocked && configured;

        const card = (
          <div
            className={cn(
              "relative flex h-full flex-col gap-1 rounded-lg border p-4 text-left transition-all",
              active
                ? "border-foreground bg-muted/40 ring-1 ring-foreground"
                : usable
                  ? "border-border hover:border-muted-foreground hover:bg-muted/20"
                  : "border-border opacity-55"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {info.providerLabel}
              </span>
              {active && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                </span>
              )}
              {!unlocked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>

            <span className="mt-1 font-medium">{info.label}</span>
            <span className="text-xs leading-relaxed text-muted-foreground">
              {info.description}
            </span>

            <div className="mt-auto flex items-baseline justify-between pt-3">
              <span className="text-sm font-medium">
                {info.credits.toFixed(2)}{" "}
                <span className="text-xs font-normal text-muted-foreground">credits</span>
              </span>
              {!unlocked ? (
                <span className="text-xs text-muted-foreground">
                  {requiredPlanFor(id).name} plan
                </span>
              ) : !configured ? (
                <span className="text-xs text-warning">Not configured</span>
              ) : null}
            </div>
          </div>
        );

        if (!unlocked) {
          return (
            <Link
              key={id}
              href="/billing"
              onClick={onLockedNavigate}
              title={`Upgrade to ${requiredPlanFor(id).name} to use ${info.label}`}
              className="rounded-lg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground"
            >
              {card}
            </Link>
          );
        }

        return (
          <button
            key={id}
            type="button"
            disabled={!configured || disabled}
            onClick={() => onChange(id)}
            title={
              disabled
                ? "Model is locked in for the generation already running"
                : configured
                  ? info.label
                  : `${info.label} needs a provider API key on this deployment`
            }
            className="rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground disabled:cursor-not-allowed"
          >
            {card}
          </button>
        );
      })}
    </div>
  );
}
