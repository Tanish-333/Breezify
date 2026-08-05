"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreview } from "@/lib/preview";
import { Button } from "@/components/ui/button";
import { Monitor, RefreshCw, Smartphone, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Viewport = "desktop" | "mobile";

export function AppPreview({
  files,
  removeBadge = false,
  onError,
  onReload,
  reloadKey,
}: {
  files: Record<string, string>;
  /** Paid plans preview clean; free stays badged. */
  removeBadge?: boolean;
  /** Fires when the preview iframe reports an uncaught error or rejection — see lib/preview.ts's injected window error handlers, which postMessage it out since the sandboxed iframe's DOM isn't otherwise reachable from here. */
  onError?: (message: string) => void;
  onReload?: () => void;
  /** Changing this remounts the iframe from scratch, same as clicking Reload — pass something that changes on every new generation/refine (e.g. a turn count) so a fix never runs in a preview tab still carrying state or timers from the crashed attempt it's replacing. */
  reloadKey?: string | number;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  // Bumping this remounts the iframe, which is the simplest reliable reload.
  const [nonce, setNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const result = useMemo(
    () => buildPreview(files, appUrl, !removeBadge),
    [files, appUrl, removeBadge]
  );

  useEffect(() => {
    if (!onError) return;
    const handleError = onError;
    function onMessage(event: MessageEvent) {
      // Only trust messages from this exact iframe, not any other frame/tab
      // that happens to postMessage this window — contentWindow is still a
      // valid reference to compare even though the iframe's opaque origin
      // (no allow-same-origin) blocks reading anything else about it.
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (data && data.source === "breezify-preview" && data.type === "error" && typeof data.message === "string") {
        handleError(data.message);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onError]);

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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setNonce((n) => n + 1);
            onReload?.();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </Button>
      </div>

      <div className="flex flex-1 justify-center overflow-auto bg-muted/20 p-3">
        <iframe
          ref={iframeRef}
          key={`${nonce}-${reloadKey ?? ""}`}
          title="App preview"
          // allow-same-origin is deliberately omitted: combined with
          // allow-scripts it would give the generated app (arbitrary,
          // effectively untrusted code) the same origin as this page, and
          // therefore read/write access to this tab's localStorage, where
          // Firebase auth state lives. Blob-URL module loading works fine
          // without it; the sandboxed iframe keeps its own opaque origin
          // instead.
          sandbox="allow-scripts allow-forms allow-popups"
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
