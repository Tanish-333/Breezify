"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreview } from "@/lib/preview";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MousePointerClick, X } from "lucide-react";

interface Selection {
  selector: string;
  tag: string;
  text: string;
  styles: { color: string; fontSize: string; padding: string };
  rect: { top: number; left: number; width: number; height: number };
}

/** rgb(a)(...) -> #rrggbb, so an <input type="color"> can actually show the current value. Falls back to black for anything it can't parse (named colors, transparent). */
function toHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Builds one plain-English refine instruction out of only the fields the
 * user actually touched — the whole point of routing through the existing
 * refine pipeline (see the callers of onRequestEdit) is that the model
 * reads this exactly like a composer submission, so it stays short and
 * concrete rather than dumping every captured style whether it changed or not.
 */
function buildInstruction(selection: Selection, draft: { text: string; color: string; fontSize: string; padding: string }): string {
  const target = `the ${selection.tag} element${selection.text ? ` currently showing the text "${selection.text}"` : ""} (approximate location in the markup: ${selection.selector})`;
  const changes: string[] = [];
  if (draft.text.trim() && draft.text.trim() !== selection.text) {
    changes.push(`change its text to "${draft.text.trim()}"`);
  }
  if (draft.color && toHex(selection.styles.color) !== draft.color) {
    changes.push(`change its text color to ${draft.color}`);
  }
  if (draft.fontSize.trim() && draft.fontSize.trim() !== selection.styles.fontSize) {
    changes.push(`change its font size to ${draft.fontSize.trim()}`);
  }
  if (draft.padding.trim() && draft.padding.trim() !== selection.styles.padding) {
    changes.push(`change its padding to ${draft.padding.trim()}`);
  }
  return `In the live preview, for ${target}: ${changes.join("; ")}.`;
}

export function AppVisualEditor({
  files,
  removeBadge = false,
  canEdit,
  disabled,
  disabledReason,
  cost,
  onRequestEdit,
  reloadKey,
}: {
  files: Record<string, string>;
  removeBadge?: boolean;
  /** A Viewer gets the same read-only iframe as everyone else, just with hover/click editing turned off — same policy as the composer and Code tab. */
  canEdit: boolean;
  /** True while a refine can't be submitted right now (insufficient credits, another editor's refine in flight) — same guards the composer already applies. */
  disabled?: boolean;
  disabledReason?: string;
  cost: number;
  /** Feeds the edit through the exact same refine pipeline a composer submission uses — see app/build/[appId]/page.tsx's refine(). */
  onRequestEdit: (instruction: string) => Promise<void> | void;
  reloadKey?: string | number;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draft, setDraft] = useState({ text: "", color: "", fontSize: "", padding: "" });
  const [submitting, setSubmitting] = useState(false);

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "");

  const result = useMemo(
    () => buildPreview(files, appUrl, !removeBadge, canEdit),
    [files, appUrl, removeBadge, canEdit]
  );

  useEffect(() => {
    if (!canEdit) return;
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (data && data.source === "breezify-preview" && data.type === "element-select") {
        const next: Selection = {
          selector: data.selector,
          tag: data.tag,
          text: data.text,
          styles: data.styles,
          rect: data.rect,
        };
        setSelection(next);
        setDraft({
          text: next.text,
          color: toHex(next.styles.color),
          fontSize: next.styles.fontSize,
          padding: next.styles.padding,
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [canEdit]);

  // A new turn means the DOM this selection pointed at may not exist
  // anymore (different markup, different element order).
  useEffect(() => {
    setSelection(null);
  }, [reloadKey]);

  async function save() {
    if (!selection) return;
    const instruction = buildInstruction(selection, draft);
    setSubmitting(true);
    try {
      await onRequestEdit(instruction);
      setSelection(null);
    } finally {
      setSubmitting(false);
    }
  }

  if (result.kind === "unsupported") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <MousePointerClick className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
        <p className="max-w-xs text-sm text-muted-foreground">{result.reason}</p>
      </div>
    );
  }

  // Editor panel position: iframe's own on-screen offset plus the clicked
  // element's rect inside it (postMessage carries that rect in the iframe's
  // own viewport coordinates — the sandboxed, opaque-origin iframe means
  // this page can never read the element itself to compute it another way).
  const iframeRect = iframeRef.current?.getBoundingClientRect();
  const panelTop = selection && iframeRect ? iframeRect.top + selection.rect.top + selection.rect.height + 8 : 0;
  const panelLeft = selection && iframeRect ? Math.min(iframeRect.left + selection.rect.left, iframeRect.right - 280) : 0;

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MousePointerClick className="h-3.5 w-3.5" />
          {canEdit ? "Click any element to edit its text or style" : "View-only — you can't edit here"}
        </p>
      </div>

      <div className="flex flex-1 justify-center overflow-auto bg-muted/20 p-3">
        <iframe
          ref={iframeRef}
          key={reloadKey ?? ""}
          title="Visual editor"
          sandbox="allow-scripts allow-forms allow-popups"
          srcDoc={result.doc}
          className="h-full w-full rounded-lg border border-border bg-white"
        />
      </div>

      {selection && (
        <div
          className="fixed z-40 w-[280px] rounded-lg border border-border bg-background p-3 shadow-2xl animate-in"
          style={{ top: Math.max(panelTop, 8), left: Math.max(panelLeft, 8) }}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Editing &lt;{selection.tag}&gt;</p>
            <button
              onClick={() => setSelection(null)}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="space-y-2.5">
            <div>
              <Label htmlFor="ve-text" className="mb-1 text-xs">Text</Label>
              <Input
                id="ve-text"
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="ve-color" className="mb-1 text-xs">Color</Label>
                <input
                  id="ve-color"
                  type="color"
                  value={draft.color}
                  onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
                  className="h-8 w-full cursor-pointer rounded border border-border bg-background"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="ve-font-size" className="mb-1 text-xs">Font size</Label>
                <Input
                  id="ve-font-size"
                  value={draft.fontSize}
                  onChange={(e) => setDraft((d) => ({ ...d, fontSize: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ve-padding" className="mb-1 text-xs">Spacing (padding)</Label>
              <Input
                id="ve-padding"
                value={draft.padding}
                onChange={(e) => setDraft((d) => ({ ...d, padding: e.target.value }))}
                className="h-8 text-xs"
              />
            </div>

            <Button
              size="sm"
              className="w-full"
              loading={submitting}
              disabled={submitting || disabled}
              title={disabled ? disabledReason : undefined}
              onClick={save}
            >
              Save · {cost.toFixed(2)}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
