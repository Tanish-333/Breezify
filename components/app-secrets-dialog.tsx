"use client";

import { useState } from "react";
import { useAppSecrets, addAppSecret, deleteAppSecret } from "@/lib/use-apps";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ModalPortal } from "@/components/modal-portal";
import { AlertCircle, Eye, EyeOff, KeyRound, Trash2, X } from "lucide-react";

export function AppSecretsDialog({ appId, onClose }: { appId: string; onClose: () => void }) {
  const { user } = useAuth();
  const { secrets, loading } = useAppSecrets(appId);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  async function add() {
    setError("");
    if (!user) {
      setError("You must be signed in.");
      return;
    }
    const trimmedKey = key.trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(trimmedKey)) {
      setError("Keys should look like an env var, e.g. STRIPE_SECRET_KEY.");
      return;
    }
    if (!value.trim()) {
      setError("Enter a value.");
      return;
    }
    setSaving(true);
    try {
      await addAppSecret(appId, user.uid, trimmedKey, value);
      setKey("");
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(secretId: string) {
    setDeleting(secretId);
    try {
      await deleteAppSecret(appId, secretId);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <ModalPortal>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl animate-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <KeyRound className="h-4 w-4" />
              Secrets
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Key/value pairs available to this app&apos;s api/ backend routes as environment
              variables once deployed. Only you can see them.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : secrets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No secrets yet.</p>
          ) : (
            secrets.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs font-medium">{s.key}</p>
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {revealed[s.id] ? s.value : "•".repeat(Math.min(s.value.length, 24))}
                  </p>
                </div>
                <button
                  onClick={() => setRevealed((r) => ({ ...r, [s.id]: !r[s.id] }))}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title={revealed[s.id] ? "Hide" : "Reveal"}
                >
                  {revealed[s.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => remove(s.id)}
                  disabled={deleting === s.id}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 space-y-3 border-t border-border pt-5">
          <div>
            <Label htmlFor="secret-key">Key</Label>
            <Input
              id="secret-key"
              value={key}
              onChange={(e) => setKey(e.target.value.toUpperCase())}
              placeholder="STRIPE_SECRET_KEY"
              className="font-mono"
            />
          </div>
          <div>
            <Label htmlFor="secret-value">Value</Label>
            <Input
              id="secret-value"
              type="password"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="sk_live_…"
              className="font-mono"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button className="w-full" onClick={add} loading={saving}>
            Add secret
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
