"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, Lock, X } from "lucide-react";
import { ModalPortal } from "@/components/modal-portal";
import { AppPreview } from "@/components/app-preview";
import { Button } from "@/components/ui/button";
import { DUPLICATE_MIN_PLAN } from "@/lib/types";
import type { AppTemplate } from "@/lib/templates";

/**
 * Full look-before-you-duplicate preview: fetches a template's real static
 * file bundle from app/api/templates/[templateId] (no auth needed — the
 * source is the same for every viewer) and runs it through the same
 * AppPreview any generated app's live preview uses, so what you see here is
 * exactly what you'd get. Duplicating only ever happens from the button
 * inside this dialog now — templates-section.tsx's cards just open this.
 */
export function TemplatePreviewDialog({
  template,
  canDuplicate,
  using,
  error,
  onDuplicate,
  onClose,
}: {
  template: AppTemplate;
  canDuplicate: boolean;
  using: boolean;
  error: string;
  onDuplicate: () => void;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    setLoadError("");
    fetch(`/api/templates/${template.id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Couldn't load this template's preview."))))
      .then((data) => {
        if (!cancelled) setFiles(data.files);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't load this template's preview.");
      });
    return () => {
      cancelled = true;
    };
  }, [template.id]);

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        onMouseDown={() => !using && onClose()}
      >
        <div
          className="flex h-[min(88vh,780px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl animate-in"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{template.title}</h2>
              <p className="truncate text-xs text-muted-foreground">{template.description}</p>
            </div>
            <button
              onClick={onClose}
              disabled={using}
              className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="relative min-h-0 flex-1 bg-muted/20">
            {loadError ? (
              <div className="flex h-full items-center justify-center p-8">
                <div className="flex max-w-sm items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{loadError}</span>
                </div>
              </div>
            ) : files ? (
              <AppPreview files={files} removeBadge />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            {error && (
              <p className="flex min-w-0 items-center gap-1.5 truncate text-xs text-error">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button variant="secondary" size="sm" onClick={onClose} disabled={using}>
                Close
              </Button>
              {canDuplicate ? (
                <Button size="sm" onClick={onDuplicate} disabled={using}>
                  {using && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Use this template
                </Button>
              ) : (
                <Link
                  href="/billing"
                  title={`Upgrade to duplicate — templates use the same ${DUPLICATE_MIN_PLAN}+ duplicate flow as any other app`}
                  className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded bg-foreground px-3 text-sm font-medium text-background shadow-soft transition-all duration-200 ease-smooth hover:opacity-90 hover:shadow-elevated active:scale-[0.97] active:opacity-80"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Upgrade to use this
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
