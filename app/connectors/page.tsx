"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Input } from "@/components/ui/input";
import { CONNECTOR_CATEGORIES, CONNECTORS } from "@/lib/connectors";
import { ExternalLink, Search } from "lucide-react";

function ConnectorsContent() {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? CONNECTORS.filter(
          (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
        )
      : CONNECTORS;
    return CONNECTOR_CATEGORIES.map((category) => ({
      category,
      connectors: matches.filter((c) => c.category === category),
    })).filter((group) => group.connectors.length > 0);
  }, [query]);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="py-10 text-center md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Connectors</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Services your generated apps can connect to. Add the keys for a specific app from its
          Secrets panel in the builder.
        </p>
      </div>

      <div className="relative mb-8">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search connectors..."
          className="pl-9"
        />
      </div>

      {grouped.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No connectors match &quot;{query}&quot;.</p>
      ) : (
        <div className="space-y-8">
          {grouped.map(({ category, connectors }) => (
            <div key={category}>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {connectors.map((connector) => {
                  const Icon = connector.icon;
                  return (
                    <div key={connector.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                          <Icon className="h-4 w-4" strokeWidth={1.5} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{connector.name}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{connector.description}</p>
                          <a
                            href={connector.docsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {connector.docsLabel}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ConnectorsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <ConnectorsContent />
      </AppShell>
    </ProtectedRoute>
  );
}
