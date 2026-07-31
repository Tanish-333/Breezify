"use client";

import { useMemo, useState } from "react";
import { buildPreview } from "@/lib/preview";
import { Button } from "@/components/ui/button";
import { Monitor, RefreshCw, Smartphone, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "mobile";

export function AppPreview({
  files,
  removeBadge = false,
}: {
  files: Record<string, string>;
  /** Paid plans preview clean; free stays badged. */
  removeBadge?: boolean;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  // Bumping this remounts the iframe, which is the simplest reliable reload.
  const [nonce, setNonce] = useState(0);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const result = useMemo(
    () => buildPreview(files, appUrl, !removeBadge),
    [files, appUrl, removeBadge]
  );

  if (result.kind === "unsupported") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <TriangleAlert className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
        <p className="max-w-xs text-sm text-muted-foreground">{result.reason}</p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Download the ZIP or push it to GitHub and run it locally.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewport("desktop")}
            title="Desktop width"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              viewport === "desktop"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Monitor className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewport("mobile")}
            title="Mobile width"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded transition-colors",
              viewport === "mobile"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Smartphone className="h-3.5 w-3.5" />
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </Button>
      </div>

      <div className="flex flex-1 justify-center overflow-auto bg-muted/20 p-3">
        <iframe
          key={nonce}
          title="App preview"
          // allow-scripts plus allow-same-origin is required for blob module
          // URLs to load; the document is generated from the user's own app.
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          srcDoc={result.doc}
          className={cn(
            "h-full rounded-lg border border-border bg-white transition-[width]",
            viewport === "mobile" ? "w-[390px]" : "w-full"
          )}
        />
      </div>
    </div>
  );
}
