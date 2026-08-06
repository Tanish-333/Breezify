"use client";

import { useState } from "react";
import { useAppSecrets, addAppSecret, deleteAppSecret, upsertAppSecret } from "@/lib/use-apps";
import { useAuth } from "@/lib/auth-context";
import { CONNECTORS, connectorForKey, type Connector } from "@/lib/connectors";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ModalPortal } from "@/components/modal-portal";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Plug,
  Trash2,
  X,
} from "lucide-react";

/** One connector's card: shows its connect/edit form when `open`, otherwise its status. */
function ConnectorCard({
  connector,
  values,
  open,
  onToggle,
  onSave,
  onDisconnect,
  saving,
}: {
  connector: Connector;
  values: Record<string, string>;
  open: boolean;
  onToggle: () => void;
  onSave: (fields: Record<string, string>) => Promise<void>;
  onDisconnect: () => Promise<void>;
  saving: boolean;
}) {
  const configuredCount = connector.fields.filter((f) => values[f.key]).length;
  const connected = configuredCount === connector.fields.length;
  const partial = configuredCount > 0 && !connected;
  const [draft, setDraft] = useState<Record<string, string>>(values);
  const [error, setError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const Icon = connector.icon;

  function startEditing() {
    setDraft(values);
    setError("");
    onToggle();
  }

  async function save() {
    setError("");
    for (const field of connector.fields) {
      if (!draft[field.key]?.trim()) {
        setError(`Enter a value for ${field.label.toLowerCase()}.`);
        return;
      }
    }
    await onSave(draft);
  }

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
          <Icon className="h-4 w-4" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium">{connector.name}</p>
            {connected && (
              <span className="flex items-center gap-0.5 rounded-full border border-success/30 px-1.5 py-0.5 text-[10px] text-success">
                <Check className="h-2.5 w-2.5" />
                Connected
              </span>
            )}
            {partial && (
              <span className="rounded-full border border-warning/30 px-1.5 py-0.5 text-[10px] text-warning">
                Incomplete
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{connector.description}</p>
        </div>
        <button
          onClick={open ? onToggle : startEditing}
          className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {open ? "Cancel" : connected || partial ? "Edit" : "Connect"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-2.5 border-t border-border pt-3">
          {connector.fields.map((field) => (
            <div key={field.key}>
              <Label htmlFor={`${connector.id}-${field.key}`}>{field.label}</Label>
              <Input
                id={`${connector.id}-${field.key}`}
                type={field.secret === false ? "text" : "password"}
                value={draft[field.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                className="font-mono"
              />
            </div>
          ))}
          <a
            href={connector.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {connector.docsLabel}
            <ExternalLink className="h-3 w-3" />
          </a>
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-2.5 text-xs text-error">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Button size="sm" className="flex-1" onClick={save} loading={saving}>
              Save
            </Button>
            {(connected || partial) && (
              <Button
                size="sm"
                variant="ghost"
                loading={disconnecting}
                onClick={async () => {
                  setDisconnecting(true);
                  try {
                    await onDisconnect();
                  } finally {
                    setDisconnecting(false);
                  }
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function AppSecretsDialog({ appId, onClose }: { appId: string; onClose: () => void }) {
  const { user } = useAuth();
  const { secrets, loading } = useAppSecrets(appId);
  const [openConnector, setOpenConnector] = useState<string | null>(null);
  const [savingConnector, setSavingConnector] = useState<string | null>(null);
  const [showCustom, setShowCustom] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState<string | null>(null);

  const valuesByKey = Object.fromEntries(secrets.map((s) => [s.key, s.value]));
  // Anything that isn't one of a known connector's fields — a hand-added key
  // from before this UI existed, or a service with no dedicated card yet.
  const customSecrets = secrets.filter((s) => !connectorForKey(s.key));

  async function saveConnector(connector: Connector, fields: Record<string, string>) {
    if (!user) return;
    setSavingConnector(connector.id);
    try {
      await Promise.all(
        connector.fields.map((f) => upsertAppSecret(appId, user.uid, f.key, fields[f.key], secrets))
      );
      setOpenConnector(null);
    } finally {
      setSavingConnector(null);
    }
  }

  async function disconnectConnector(connector: Connector) {
    const ids = secrets.filter((s) => connector.fields.some((f) => f.key === s.key)).map((s) => s.id);
    await Promise.all(ids.map((id) => deleteAppSecret(appId, id)));
    setOpenConnector(null);
  }

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
      await upsertAppSecret(appId, user.uid, trimmedKey, value, secrets);
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
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-background p-6 shadow-2xl animate-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Plug className="h-4 w-4" />
              Connectors
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect a service this app&apos;s backend can call — each one stores real env vars its
              api/ routes read via process.env. Only you can see the values.
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
          <div className="mt-5 space-y-2">
            {CONNECTORS.map((connector) => (
              <ConnectorCard
                key={connector.id}
                connector={connector}
                values={valuesByKey}
                open={openConnector === connector.id}
                onToggle={() => setOpenConnector((c) => (c === connector.id ? null : connector.id))}
                onSave={(fields) => saveConnector(connector, fields)}
                onDisconnect={() => disconnectConnector(connector)}
                saving={savingConnector === connector.id}
              />
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-border pt-4">
          <button
            onClick={() => setShowCustom((v) => !v)}
            className="flex w-full items-center justify-between text-left text-sm font-medium"
          >
            <span className="flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" />
              Custom
              {customSecrets.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground">{customSecrets.length}</span>
              )}
            </span>
            <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showCustom && "rotate-180")} />
          </button>

          {showCustom && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                Anything not covered by a connector above — a plain env var this app&apos;s backend expects.
              </p>

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
                        onClick={() => remove(s.id)}
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

              <div>
                <Label htmlFor="secret-key">Key</Label>
                <Input
                  id="secret-key"
                  value={key}
                  onChange={(e) => setKey(e.target.value.toUpperCase())}
                  placeholder="SOME_API_KEY"
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
                  placeholder="..."
                  className="font-mono"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button className="w-full" size="sm" onClick={add} loading={saving}>
                Add
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  );
}
