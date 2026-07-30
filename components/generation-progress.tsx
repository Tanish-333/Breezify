"use client";

import { useEffect, useState } from "react";
import { Check, FileCode2, Loader2 } from "lucide-react";

export function GenerationProgress({
  status,
  chars,
  files,
  modelLabel,
}: {
  status: string;
  chars: number;
  files: string[];
  modelLabel: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // The last detected path is the file currently being written; the ones
  // before it are complete.
  const completed = files.slice(0, -1);
  const current = files[files.length - 1];

  return (
    <div className="overflow-hidden rounded-lg border border-border animate-in">
      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2.5 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-medium">{status || `Generating with ${modelLabel}`}</span>
        </div>
        <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
          {chars > 0 && <span>{(chars / 1000).toFixed(1)}k chars</span>}
          <span>
            {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          </span>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto p-2">
        {files.length === 0 ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-3 animate-pulse rounded bg-muted"
                style={{ width: `${70 - i * 15}%`, animationDelay: `${i * 120}ms` }}
              />
            ))}
            <p className="pt-2 text-xs text-muted-foreground">
              {modelLabel} is planning your app structure
            </p>
          </div>
        ) : (
          <>
            {completed.map((path) => (
              <div
                key={path}
                className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"
              >
                <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                <span className="truncate font-mono">{path}</span>
              </div>
            ))}
            {current && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium">
                <FileCode2 className="h-3.5 w-3.5 shrink-0 animate-pulse" />
                <span className="truncate font-mono">{current}</span>
              </div>
            )}
          </>
        )}
      </div>

      <div className="h-0.5 w-full overflow-hidden bg-border">
        <div className="progress-track h-full w-1/4 bg-foreground/50" />
      </div>
    </div>
  );
}
