"use client";

import { useMemo, useState } from "react";
import { useAppSecrets, addAppSecret, deleteAppSecret } from "@/lib/use-apps";
import { useAuth } from "@/lib/auth-context";
import { CONNECTORS, type Connector, type ConnectorField } from "@/lib/connectors";
import type { AppSecret } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ModalPortal } from "@/components/modal-portal";
import { AlertCircle, Eye, EyeOff, ExternalLink, Plug, Trash2, X } from "lucide-react";

/**
 * One connector field: an env-var-shaped key with either a saved value
 * (shown masked, revealable, deletable — same as before) or an empty input
 * with a "Connect" button that saves it. Every field maps 1:1 to a doc in
 * apps/{appId}/secrets, same as the old freeform key/value list — this is
 * only a guided UI on top of the identical storage.
 */
function ConnectorFieldRow({
  appId,
  userId,
  field,
  secret,
}: {
  appId: string;
  userId: string;
  field: ConnectorField;
  secret: AppSecret | undefined;
}) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    if (!value.trim()) return;
    setSaving(true);
    setError("");
    try {
      await addAppSecret(appId, userId, field.key, value.trim());
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function disconnect() {
    if (!secret) return;
    setDeleting(true);
    try {
      await deleteAppSecret(appId, secret.id);
    } finally {
      setDeleting(false);
    }
  }

  if (secret) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-muted-foreground">{field.label}</p>
          <p className="truncate font-mono text-xs">
            {revealed ? secret.value : "•".repeat(Math.min(secret.value.length, 20))}
          </p>
        </div>
        <button
          onClick={() => setRevealed((r) => !r)}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title={revealed ? "Hide" : "Reveal"}
        >
          {revealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
        <button
          onClick={disconnect}
          disabled={deleting}
          className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
          title="Disconnect"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) connect();
          }}
          type={field.type}
          placeholder={field.placeholder}
          className="h-8 font-mono text-xs"
        />
        <Button size="sm" className="h-8 shrink-0 px-2.5 text-xs" loading={saving} disabled={!value.trim()} onClick={connect}>
          Connect
        </Button>
      </div>
      {error && <p className="mt-1 text-[11px] text-error">{error}</p>}
    </div>
  );
}

function ConnectorCard({
  connector,
  appId,
  userId,
  secretsByKey,
}: {
  connector: Connector;
  appId: string;
  userId: string;
  secretsByKey: Map<string, AppSecret>;
}) {
  const Icon = connector.icon;
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{connector.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{connector.description}</p>
        </div>
      </div>
      <div className="mt-2.5 space-y-1.5">
        {connector.fields.map((field) => (
          <ConnectorFieldRow
            key={field.key}
            appId={appId}
            userId={userId}
            field={field}
            secret={secretsByKey.get(field.key)}
          />
        ))}
      </div>
      <a
        href={connector.helpUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        Get your key at {connector.helpLabel}
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
}

export function AppSecretsDialog({ appId, onClose }: { appId: string; onClose: () => void }) {
  const { user } = useAuth();
  const { secrets, loading } = useAppSecrets(appId);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  const secretsByKey = useMemo(() => new Map(secrets.map((s) => [s.key, s])), [secrets]);
  // Anything already saved that isn't one of the known connectors above —
  // still fully manageable here, just not folded into a guided card. Covers
  // both genuinely custom keys and anything saved before this panel existed.
  const knownKeys = useMemo(() => new Set(CONNECTORS.flatMap((c) => c.fields.map((f) => f.key))), []);
  const customSecrets = secrets.filter((s) => !knownKeys.has(s.key));

  async function addCustom() {
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

  async function removeCustom(secretId: string) {
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
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-2xl animate-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Plug className="h-4 w-4" />
              Connectors
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect a service by pasting your own API key — stored as an environment variable this
              app&apos;s api/ backend routes can read once deployed. Only you can see them.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="mt-5 text-sm text-muted-foreground">Loading…</p>
        ) : (
          user && (
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CONNECTORS.map((connector) => (
                <ConnectorCard
                  key={connector.id}
                  connector={connector}
                  appId={appId}
                  userId={user.uid}
                  secretsByKey={secretsByKey}
                />
              ))}
            </div>
          )
        )}

        <div className="mt-5 space-y-3 border-t border-border pt-5">
          <p className="text-xs font-medium text-muted-foreground">Custom</p>

          {customSecrets.length > 0 && (
            <div className="space-y-2">
              {customSecrets.map((s) => (
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
                    onClick={() => removeCustom(s.id)}
                    disabled={deleting === s.id}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="secret-key" className="sr-only">Key</Label>
              <Input
                id="secret-key"
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                placeholder="CUSTOM_KEY_NAME"
                className="font-mono"
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="secret-value" className="sr-only">Value</Label>
              <Input
                id="secret-value"
                type="password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Value"
                className="font-mono"
              />
            </div>
            <Button loading={saving} onClick={addCustom}>
              Add
            </Button>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
