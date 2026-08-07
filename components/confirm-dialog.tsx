"use client";

import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalPortal } from "@/components/modal-portal";

/**
 * Replaces window.confirm()/alert() for destructive actions: those render as
 * a browser-chrome popup stamped with the site's own URL ("breezify.dev
 * says..."), which looks broken/untrustworthy compared to the rest of the UI.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Delete",
  loading = false,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  error?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={() => !loading && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-6 shadow-2xl animate-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
