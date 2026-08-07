"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildPreview, withVisualEditing } from "@/lib/preview";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Check, MessageSquarePlus, MousePointerClick, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SelectedElement {
  selector: string;
  tag: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  styles: { color: string; fontSize: string; fontWeight: string; padding: string };
}

/** "rgb(r, g, b)"/"rgba(r, g, b, a)" -> "#rrggbb". Falls back to black if the computed style can't be parsed (shouldn't happen for a real computed color, but a bad value shouldn't crash the editor). */
function rgbToHex(rgb: string): string {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return "#000000";
  const [r, g, b] = m.map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Visual tab (see the "preview" | "visual" | "code" Pane union in
 * app/build/[appId]/page.tsx). Renders the app like AppPreview, but with
 * lib/preview.ts's withVisualEditing() script injected so clicking an
 * element selects it instead of activating it. Saving a change turns it
 * into a plain-English instruction and hands it to the SAME refine
 * pipeline a normal composer submission uses (`onEdit`) — no separate
 * AST-patching system; see the scope note on this feature for why that's
 * deliberate for a first version.
 */
export function AppVisualEditor({
  files,
  onEdit,
  onAddToChat,
  disabled,
  disabledReason,
  reloadKey,
}: {
  files: Record<string, string>;
  onEdit: (instruction: string) => void;
  /**
   * Drops a reference to the selected element into the composer instead of
   * submitting anything — for "I want to talk about this one, not just
   * tweak its text/color/size/padding" (e.g. "make this whole card a link
   * to the pricing page"), which the Save button's fixed set of style
   * fields can't express. Never blocked by `disabled` — queuing up what to
   * say next is exactly what you'd do while a previous refine is still
   * running.
   */
  onAddToChat?: (reference: string) => void;
  /** True while a refine from a previous edit is already in flight, or credits are insufficient — blocks Save, doesn't block selecting (so the user can queue up what they want to say next). */
  disabled?: boolean;
  disabledReason?: string;
  reloadKey?: string | number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const [colorDraft, setColorDraft] = useState("#000000");
  const [fontSizeDraft, setFontSizeDraft] = useState("");
  const [paddingDraft, setPaddingDraft] = useState("");
  const [panelPos, setPanelPos] = useState({ left: 0, top: 0 });

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  const result = useMemo(() => buildPreview(files, appUrl, false), [files, appUrl]);
  const doc = result.kind === "html" ? withVisualEditing(result.doc) : null;

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.source !== "breezify-preview" || data.type !== "element-click") return;
      const el: SelectedElement = {
        selector: data.selector,
        tag: data.tag,
        text: data.text ?? "",
        rect: data.rect,
        styles: data.styles ?? {},
      };
      setSelected(el);
      setTextDraft(el.text);
      setColorDraft(el.styles.color ? rgbToHex(el.styles.color) : "#000000");
      setFontSizeDraft(el.styles.fontSize ?? "");
      setPaddingDraft(el.styles.padding ?? "");

      const iframeRect = iframeRef.current?.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (iframeRect && containerRect) {
        const rawLeft = iframeRect.left - containerRect.left + el.rect.x;
        const rawTop = iframeRect.top - containerRect.top + el.rect.y + el.rect.height + 8;
        // Keep the panel on-screen even for an element hard against the
        // iframe's right or bottom edge.
        setPanelPos({
          left: Math.max(8, Math.min(rawLeft, containerRect.width - 296)),
          top: Math.max(8, Math.min(rawTop, containerRect.height - 260)),
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // A new turn's files mean the selected element's selector may no longer
  // point at anything real (its text/position could have just changed, or
  // it could be gone entirely) — close rather than risk editing a stale
  // target.
  useEffect(() => {
    setSelected(null);
  }, [reloadKey]);

  function save() {
    if (!selected) return;
    const changes: string[] = [];
    const originalColor = selected.styles.color ? rgbToHex(selected.styles.color) : null;

    if (textDraft.trim() && textDraft.trim() !== selected.text) {
      changes.push(
        `change the text of the ${selected.tag} element matching the CSS selector "${selected.selector}" to "${textDraft.trim()}"`
      );
    }
    if (colorDraft && colorDraft !== originalColor) {
      changes.push(`change that same element's text color to ${colorDraft}`);
    }
    if (fontSizeDraft.trim() && fontSizeDraft.trim() !== selected.styles.fontSize) {
      changes.push(`change that same element's font size to ${fontSizeDraft.trim()}`);
    }
    if (paddingDraft.trim() && paddingDraft.trim() !== selected.styles.padding) {
      changes.push(`change that same element's padding to ${paddingDraft.trim()}`);
    }

    if (changes.length > 0) onEdit(changes.join(", and "));
    setSelected(null);
  }

  function addToChat() {
    if (!selected) return;
    const label = selected.text.trim()
      ? `the ${selected.tag} element with the text "${selected.text.trim()}"`
      : `the ${selected.tag} element matching the CSS selector "${selected.selector}"`;
    onAddToChat?.(`Regarding ${label}: `);
    setSelected(null);
  }

  if (result.kind === "unsupported") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <TriangleAlert className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
        <p className="max-w-xs text-sm text-muted-foreground">{result.reason}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full overflow-hidden bg-muted/20">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <MousePointerClick className="h-3.5 w-3.5" />
        Click any element in the preview to edit its text or style.
      </div>
      <iframe
        ref={iframeRef}
        key={reloadKey ?? ""}
        title="Visual editor"
        sandbox="allow-scripts allow-forms allow-popups"
        srcDoc={doc ?? ""}
        className="h-[calc(100%-2.25rem)] w-full border-0 bg-white"
      />

      {selected && (
        <div
          className="absolute z-20 w-[280px] space-y-2.5 rounded-lg border border-border bg-background p-3 shadow-xl animate-in"
          style={{ left: panelPos.left, top: panelPos.top }}
        >
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] text-muted-foreground">{selected.selector}</p>
            <button
              onClick={() => setSelected(null)}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div>
            <Label htmlFor="ve-text">Text</Label>
            <Input id="ve-text" value={textDraft} onChange={(e) => setTextDraft(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="ve-color">Color</Label>
              <input
                id="ve-color"
                type="color"
                value={colorDraft}
                onChange={(e) => setColorDraft(e.target.value)}
                className="h-9 w-full cursor-pointer rounded border border-border bg-background"
              />
            </div>
            <div>
              <Label htmlFor="ve-fontsize">Font size</Label>
              <Input id="ve-fontsize" value={fontSizeDraft} onChange={(e) => setFontSizeDraft(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="ve-padding">Spacing (padding)</Label>
            <Input id="ve-padding" value={paddingDraft} onChange={(e) => setPaddingDraft(e.target.value)} />
          </div>

          {disabled && disabledReason && (
            <p className="text-xs text-muted-foreground">{disabledReason}</p>
          )}

          <div className={cn("flex gap-2", disabled && "opacity-60")}>
            <Button size="sm" className="flex-1" onClick={save} disabled={disabled}>
              <Check className="h-3.5 w-3.5" />
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Cancel
            </Button>
          </div>
          {onAddToChat && (
            <button
              type="button"
              onClick={addToChat}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              Add to chat instead
            </button>
          )}
        </div>
      )}
    </div>
  );
}
