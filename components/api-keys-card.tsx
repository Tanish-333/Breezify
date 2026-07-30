"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import {
  getApiKey,
  isByokEnabled,
  maskKey,
  setApiKey,
  setByokEnabled,
} from "@/lib/byok";
import type { Provider } from "@/lib/types";
import { Check, KeyRound, ShieldCheck, Trash2 } from "lucide-react";

const PROVIDERS: {
  id: Provider;
  label: string;
  placeholder: string;
  help: string;
  url: string;
}[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-...",
    help: "Powers Haiku 4.5, Sonnet 4.5, and Opus 5.",
    url: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    label: "Google Gemini",
    placeholder: "AIza...",
    help: "Powers Gemini 3.6 Flash and Gemini 3.1 Pro.",
    url: "https://aistudio.google.com/apikey",
  },
];

function ProviderRow({ provider }: { provider: (typeof PROVIDERS)[number] }) {
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setSaved(getApiKey(provider.id));
  }, [provider.id]);

  function save() {
    setApiKey(provider.id, draft);
    setSaved(draft.trim());
    setDraft("");
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  }

  function remove() {
    setApiKey(provider.id, "");
    setSaved("");
    setDraft("");
    setEditing(false);
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{provider.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{provider.help}</p>
        </div>
        {saved && !editing && (
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-success/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-success">
            <Check className="h-2.5 w-2.5" />
            Saved
          </span>
        )}
      </div>

      {saved && !editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <code className="rounded border border-border bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground">
            {maskKey(saved)}
          </code>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Replace
          </Button>
          <Button variant="ghost" size="sm" onClick={remove}>
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </Button>
        </div>
      ) : (
        <div className="mt-3">
          <Label htmlFor={`key-${provider.id}`} className="sr-only">
            {provider.label} API key
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`key-${provider.id}`}
              type="password"
              value={draft}
              autoComplete="off"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) save();
              }}
              placeholder={provider.placeholder}
              className="flex-1 font-mono text-xs"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={!draft.trim()}>
                Save
              </Button>
              {saved && (
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
          <a
            href={provider.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[11px] text-muted-foreground underline transition-colors hover:text-foreground"
          >
            Get a {provider.label} key
          </a>
        </div>
      )}

      {justSaved && (
        <p className="mt-2 text-[11px] text-success">Saved to this browser.</p>
      )}
    </div>
  );
}

export function ApiKeysCard() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isByokEnabled());
  }, []);

  function toggle(next: boolean) {
    setByokEnabled(next);
    setEnabled(next);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Your own API keys
        </CardTitle>
        <CardDescription>
          Use your own provider account instead of Feather credits. Generations run
          with your key cost 0 credits and unlock every model, whatever your plan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => toggle(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-current"
          />
          <span>
            <span className="block text-sm font-medium">Use my keys when available</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              When off, Feather uses its own keys and charges credits as usual.
            </span>
          </span>
        </label>

        {PROVIDERS.map((p) => (
          <ProviderRow key={p.id} provider={p} />
        ))}

        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Keys are stored in this browser only and sent with the single request that
            uses them. Feather never saves them to its database, so they don&apos;t sync
            across devices and are cleared if you clear site data.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
