"use client";

import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { CodePreview } from "@/components/code-preview";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/use-apps";
import { MODEL_INFO } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertCircle, ArrowLeft, Loader2, Sparkles } from "lucide-react";

function AppDetailContent() {
  const params = useParams<{ appId: string }>();
  const router = useRouter();
  const { app, loading } = useApp(params.appId);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-muted-foreground">
          This app doesn&apos;t exist or you don&apos;t have access to it.
        </p>
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>
          Back to dashboard
        </Button>
      </div>
    );
  }

  const files = app.generatedCode?.files ?? {};

  return (
    <div className="mx-auto max-w-5xl">
      <button
        onClick={() => router.push("/dashboard")}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{app.name}</h1>
            <StatusBadge status={app.status} />
          </div>
          {app.summary && (
            <p className="mt-1.5 text-sm text-muted-foreground">{app.summary}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {MODEL_INFO[app.model]?.label ?? app.model} · Created {formatDate(app.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Prompt</p>
        <p className="mt-1.5 text-sm leading-relaxed">{app.prompt}</p>
      </div>

      <div className="mt-8">
        {app.status === "generating" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
            <Sparkles className="h-6 w-6 animate-pulse text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generating your app...</p>
          </div>
        )}

        {app.status === "error" && (
          <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{app.errorMessage || "Something went wrong generating this app."}</span>
          </div>
        )}

        {Object.keys(files).length > 0 && (
          <CodePreview files={files} appName={app.name} />
        )}
      </div>
    </div>
  );
}

export default function AppDetailPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <AppDetailContent />
      </AppShell>
    </ProtectedRoute>
  );
}
