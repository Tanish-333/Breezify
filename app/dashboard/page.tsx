"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { PromptComposer } from "@/components/prompt-composer";
import { GenerationProgress } from "@/components/generation-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useUserApps, deleteApp } from "@/lib/use-apps";
import { fetchModelAvailability, generateAppRequest } from "@/lib/api-client";
import { takePendingPrompt } from "@/lib/pending-prompt";
import { formatDate } from "@/lib/utils";
import { MODEL_INFO, planAllowsModel, type ModelId, type PlanId } from "@/lib/types";
import { AlertCircle, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";

const STARTERS = [
  "A habit tracker with streaks and a calendar heatmap",
  "An invoice generator with a client list",
  "A markdown notes app with tags and search",
  "A team standup board with async check-ins",
];

function DashboardContent() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const { apps, loading: appsLoading } = useUserApps(user?.uid);
  const plan: PlanId = profile?.plan ?? "free";

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>("haiku");
  const [availability, setAvailability] = useState<Record<string, boolean>>();
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ chars: 0, files: [] as string[] });
  const [error, setError] = useState("");

  useEffect(() => {
    const pending = takePendingPrompt();
    if (pending) setPrompt(pending);
    fetchModelAvailability().then(setAvailability).catch(() => {});
  }, []);

  useEffect(() => {
    if (!planAllowsModel(plan, model)) setModel("haiku");
  }, [plan, model]);

  const cost = MODEL_INFO[model].credits;
  const insufficient = profile !== null && profile.credits < cost;

  const firstName = user?.displayName?.split(" ")[0];

  async function handleGenerate(composedPrompt: string) {
    setError("");
    setProgress({ chars: 0, files: [] });
    setStatus("Starting");
    setGenerating(true);
    try {
      const res = await generateAppRequest(composedPrompt, model, {
        onStatus: setStatus,
        onProgress: setProgress,
      });
      await refreshProfile();
      router.push(`/build/${res.appId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setGenerating(false);
    }
  }

  const recent = useMemo(() => apps.slice(0, 6), [apps]);

  return (
    <div className="mx-auto max-w-4xl">
      <section className="py-10 text-center md:py-16">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {firstName ? `Let's build something, ${firstName}` : "Let's build something"}
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Describe an app and Feather 123 writes the whole codebase.
        </p>

        <div className="mx-auto mt-8 max-w-2xl text-left">
          <PromptComposer
            value={prompt}
            onChange={setPrompt}
            model={model}
            onModelChange={setModel}
            plan={plan}
            availability={availability}
            onSubmit={handleGenerate}
            loading={generating}
            disabled={insufficient}
            placeholder={`Ask Feather 123 to build...`}
          />

          {insufficient && !generating && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              You&apos;re out of credits.{" "}
              <Link href="/billing" className="text-foreground underline">
                Get more
              </Link>
            </p>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!generating && !prompt && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setPrompt(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {generating && (
            <div className="mt-5">
              <GenerationProgress
                status={status}
                chars={progress.chars}
                files={progress.files}
                modelLabel={MODEL_INFO[model].label}
              />
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-border pt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">Your apps</h2>
          {apps.length > 6 && (
            <span className="text-xs text-muted-foreground">
              Showing 6 of {apps.length}
            </span>
          )}
        </div>

        {appsLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : apps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <FolderOpen className="h-7 w-7 text-muted-foreground" strokeWidth={1.25} />
              <p className="text-sm text-muted-foreground">
                Nothing here yet. Your generated apps will show up in this space.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((app) => (
              <Card
                key={app.id}
                className="group flex flex-col transition-colors hover:border-muted-foreground"
              >
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/build/${app.id}`} className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium hover:underline">
                        {app.name}
                      </h3>
                    </Link>
                    <StatusBadge status={app.status} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                    {app.summary || app.prompt}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {MODEL_INFO[app.model]?.label ?? app.model} · {formatDate(app.createdAt)}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm(`Delete "${app.name}"? This can't be undone.`)) {
                          deleteApp(app.id).catch(() =>
                            alert("Couldn't delete this app. Please try again.")
                          );
                        }
                      }}
                      title="Delete"
                      className="shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {apps.length > 6 && (
          <div className="mt-4 text-center">
            <Link href="/build">
              <Button variant="secondary" size="sm">
                <Plus className="h-4 w-4" />
                New app
              </Button>
            </Link>
          </div>
        )}
      </section>
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
