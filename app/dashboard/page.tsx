"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useUserApps, deleteApp } from "@/lib/use-apps";
import { formatDate } from "@/lib/utils";
import { MODEL_INFO, PLANS } from "@/lib/types";
import {
  ExternalLink,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function DashboardContent() {
  const { user, profile } = useAuth();
  const { apps, loading } = useUserApps(user?.uid);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.prompt?.toLowerCase().includes(q)
    );
  }, [apps, search]);

  const readyCount = apps.filter((a) => a.status === "ready" || a.status === "live").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {user?.displayName ? `Welcome back, ${user.displayName.split(" ")[0]}` : "My Apps"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {apps.length === 0
              ? "Let's build something."
              : `${apps.length} app${apps.length === 1 ? "" : "s"} in your workspace.`}
          </p>
        </div>
        <Link href="/build">
          <Button>
            <Plus className="h-4 w-4" />
            New app
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Apps built" value={String(apps.length)} />
        <Stat label="Ready" value={String(readyCount)} />
        <Stat
          label="Credits"
          value={profile ? profile.credits.toFixed(2) : "—"}
        />
        <Stat label="Plan" value={profile ? PLANS[profile.plan]?.name ?? "Free" : "—"} />
      </div>

      {apps.length > 3 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your apps"
            className="pl-9"
          />
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : apps.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-20 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" strokeWidth={1.25} />
            <div>
              <h3 className="font-medium">No apps yet</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Describe an app and Feather 123 will build it for you.
              </p>
            </div>
            <Link href="/build">
              <Button>
                <Plus className="h-4 w-4" />
                Build your first app
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No apps match “{search}”.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app) => (
            <Card
              key={app.id}
              className="group flex flex-col transition-colors hover:border-muted-foreground"
            >
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/build/${app.id}`} className="min-w-0 flex-1">
                    <h3 className="truncate font-medium leading-tight hover:underline">
                      {app.name}
                    </h3>
                  </Link>
                  <StatusBadge status={app.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                  {app.summary || app.prompt}
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{MODEL_INFO[app.model]?.label ?? app.model}</span>
                  <span>·</span>
                  <span>{formatDate(app.createdAt)}</span>
                </div>
                <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                  <Link href={`/build/${app.id}`} className="flex-1">
                    <Button variant="secondary" size="sm" className="w-full">
                      Open
                    </Button>
                  </Link>
                  {app.deployedUrl && (
                    <a href={app.deployedUrl} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="icon" title="Open live app">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    onClick={() => {
                      if (confirm(`Delete "${app.name}"? This can't be undone.`)) {
                        deleteApp(app.id).catch(() => {
                          alert("Couldn't delete this app. Please try again.");
                        });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <DashboardContent />
      </AppShell>
    </ProtectedRoute>
  );
}
