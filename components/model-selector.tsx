"use client";

import { cn } from "@/lib/utils";
import { MODEL_INFO, type ModelId } from "@/lib/types";
import { Check } from "lucide-react";

export function ModelSelector({
  value,
  onChange,
}: {
  value: ModelId;
  onChange: (model: ModelId) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {(Object.keys(MODEL_INFO) as ModelId[]).map((id) => {
        const info = MODEL_INFO[id];
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "relative flex flex-col items-start gap-1 rounded-lg border p-4 text-left transition-colors",
              active ? "border-foreground" : "border-border hover:border-muted-foreground"
            )}
          >
            {active && (
              <span className="absolute right-3 top-3 flex h-4 w-4 items-center justify-center rounded-full bg-foreground text-background">
                <Check className="h-2.5 w-2.5" />
              </span>
            )}
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {info.tier}
            </span>
            <span className="font-medium">{info.label}</span>
            <span className="text-xs text-muted-foreground">{info.description}</span>
            <span className="mt-2 text-sm font-medium">{info.credits.toFixed(2)} credits</span>
          </button>
        );
      })}
    </div>
  );
}
