"use client";

import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useUserApps, deleteApp } from "@/lib/use-apps";
import { formatDate } from "@/lib/utils";
import { MODEL_INFO } from "@/lib/types";
import { Plus, ExternalLink, Trash2, Sparkles, Loader2 } from "lucide-react";

function DashboardContent() {
  const { user, profile } = useAuth();
  const { apps, loading } = useUserApps(user?.uid);

  return (
    <div>
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Apps</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile ? `${profile.credits.toFixed(2)} credits remaining` : "Loading account..."}
          </p>
        </div>
        <Link href="/build">
          <Button>
            <Plus className="h-4 w-4" />
            New app
          </Button>
        </Link>
      </div>

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
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <Card key={app.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-tight">{app.name}</h3>
                  <StatusBadge status={app.status} />
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{app.prompt}</p>
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
