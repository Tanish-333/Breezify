"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { PromptComposer } from "@/components/prompt-composer";
import { TemplateGallery } from "@/components/template-gallery";
import { GenerationProgress } from "@/components/generation-progress";
import { GithubImportDialog } from "@/components/github-import-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { GithubIcon } from "@/components/oauth-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge, DeployBadge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { useUserApps, useCollaboratingApps } from "@/lib/use-apps";
import {
  fetchModelAvailability,
  generateAppRequest,
  deleteAppRequest,
  undeployAppRequest,
  type ClarifyQuestion,
} from "@/lib/api-client";
import { takePendingPrompt } from "@/lib/pending-prompt";
import { formatDate } from "@/lib/utils";
import {
  displayStatus,
  effectiveDeployStatus,
  IMPORT_MIN_PLAN,
  MODEL_INFO,
  PLAN_RANK,
  planAllowsModel,
  type ModelId,
  type PlanId,
} from "@/lib/types";
import { AlertCircle, FolderOpen, Loader2, Lock, PowerOff, Search, Trash2, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

function DashboardContent() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const { apps: ownedApps, loading: ownedLoading } = useUserApps(user?.uid);
  const { apps: sharedApps, loading: sharedLoading } = useCollaboratingApps(user?.uid);
  const apps = useMemo(
    () => [...ownedApps, ...sharedApps].sort((a, b) => b.createdAt - a.createdAt),
    [ownedApps, sharedApps]
  );
  const appsLoading = ownedLoading || sharedLoading;
  const plan: PlanId = profile?.plan ?? "free";
  const canImport = PLAN_RANK[plan] >= PLAN_RANK[IMPORT_MIN_PLAN];
  const [showImport, setShowImport] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<
    { id: string; name: string; githubUrl?: string; kind: "delete" | "undeploy" } | null
  >(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>("haiku");
  const [availability, setAvailability] = useState<Record<string, boolean>>();
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ chars: 0, files: [] as string[] });
  const [error, setError] = useState("");
  const [clarify, setClarify] = useState<ClarifyQuestion | null>(null);
  const [clarifyAnswer, setClarifyAnswer] = useState("");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);

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

  async function handleGenerate(composedPrompt: string, isClarified = false) {
    setError("");
    setClarify(null);
    setClarifyAnswer("");
    setProgress({ chars: 0, files: [] });
    setStatus("Starting");
    setGenerating(true);
    try {
      const res = await generateAppRequest(
        composedPrompt,
        model,
        { onStatus: setStatus, onProgress: setProgress },
        undefined,
        undefined,
        isClarified
      );
      await refreshProfile();
      if ("clarify" in res) {
        setClarify(res.clarify);
        setGenerating(false);
      } else {
        router.push(`/build/${res.appId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
      setGenerating(false);
    }
  }

  function answerClarify(answer: string) {
    if (!clarify || !answer.trim()) return;
    const combined = `${prompt}\n\n${clarify.question} ${answer.trim()}`;
    setPrompt(combined);
    handleGenerate(combined, true);
  }

  // Everything the user owns must stay reachable from here, so search filters
  // the full list and "Show all" expands past the initial six.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? apps.filter(
          (a) =>
            a.name?.toLowerCase().includes(q) ||
            a.prompt?.toLowerCase().includes(q) ||
            a.summary?.toLowerCase().includes(q)
        )
      : apps;
    return showAll || q ? matched : matched.slice(0, 6);
  }, [apps, search, showAll]);

  const searching = search.trim().length > 0;

  return (
    <div className="mx-auto max-w-4xl">
      <section className="py-10 text-center md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          {firstName ? `Let's build something, ${firstName}` : "Let's build something"}
        </h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Describe an app and Breezify writes the whole codebase.
        </p>

        <div className="mx-auto mt-8 max-w-2xl text-left">
          <div className="mb-2 flex justify-end">
            {canImport ? (
              <button
                type="button"
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <GithubIcon className="h-3.5 w-3.5" />
                Import from GitHub
              </button>
            ) : (
              <Link
                href="/billing"
                title="Upgrade to Plus to import from GitHub"
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="relative inline-flex">
                  <GithubIcon className="h-3.5 w-3.5" />
                  <Lock
                    className="absolute -bottom-1 -right-1.5 h-2 w-2 rounded-full bg-background text-muted-foreground"
                    strokeWidth={3}
                  />
                </span>
                Import from GitHub
              </Link>
            )}
          </div>
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
            placeholder={`Ask Breezify to build...`}
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

          {clarify && !generating && (
            <div className="mt-4 animate-in space-y-3 rounded-lg border border-border bg-muted/20 p-4 text-left">
              <p className="text-sm font-medium">{clarify.question}</p>
              {clarify.options.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {clarify.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => answerClarify(opt)}
                      className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:border-foreground hover:text-foreground"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  value={clarifyAnswer}
                  onChange={(e) => setClarifyAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && clarifyAnswer.trim()) answerClarify(clarifyAnswer);
                  }}
                  placeholder="Or type your own answer..."
                  className="h-9"
                />
                <Button size="sm" disabled={!clarifyAnswer.trim()} onClick={() => answerClarify(clarifyAnswer)}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {!generating && !prompt && (
            <div className="mt-6">
              <TemplateGallery onSelect={setPrompt} />
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

      <section className="mt-10 border-t border-border pt-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-medium">
            Your apps
            {apps.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">{apps.length}</span>
            )}
          </h2>
          {apps.length > 6 && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your apps"
                className="h-9 pl-8 text-sm"
              />
            </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((app) => (
              <Card
                key={app.id}
                className="group flex flex-col transition-all hover:-translate-y-0.5 hover:border-muted-foreground hover:shadow-sm"
              >
                <CardContent className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/build/${app.id}`} className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-medium hover:underline">
                        {app.name}
                      </h3>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {app.userId !== user?.uid && (
                        <span className="flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          <Users className="h-2.5 w-2.5" />
                          Shared
                        </span>
                      )}
                      {app.status === "generating" || app.status === "error" || app.status === "stopped" ? (
                        <StatusBadge status={displayStatus(app.status)} />
                      ) : effectiveDeployStatus(app) ? (
                        <DeployBadge status={effectiveDeployStatus(app)} />
                      ) : (
                        <StatusBadge status="ready" />
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                    {app.summary || app.prompt}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate">
                      {MODEL_INFO[app.model]?.label ?? app.model} · {formatDate(app.createdAt)}
                    </span>
                    {app.userId === user?.uid && (
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        {effectiveDeployStatus(app) === "live" && (
                          <button
                            onClick={() => {
                              setConfirmError("");
                              setConfirmTarget({ id: app.id, name: app.name, kind: "undeploy" });
                            }}
                            title="Undeploy (frees up a subdomain slot, keeps the app)"
                            className="rounded p-1 hover:bg-muted hover:text-foreground"
                          >
                            <PowerOff className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setConfirmError("");
                            setConfirmTarget({ id: app.id, name: app.name, githubUrl: app.githubUrl, kind: "delete" });
                          }}
                          title="Delete"
                          className="rounded p-1 hover:bg-muted hover:text-foreground"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!appsLoading && searching && visible.length === 0 && (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No apps match “{search}”.
          </p>
        )}

        {!searching && apps.length > 6 && (
          <div className="mt-4 text-center">
            <Button variant="secondary" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Show less" : `Show all ${apps.length}`}
            </Button>
          </div>
        )}
      </section>

      {showImport && <GithubImportDialog onClose={() => setShowImport(false)} />}

      {confirmTarget && (
        <ConfirmDialog
          title={
            confirmTarget.kind === "delete"
              ? `Delete "${confirmTarget.name}"?`
              : `Undeploy "${confirmTarget.name}"?`
          }
          description={
            confirmTarget.kind === "delete"
              ? // Deleting only ever removes Breezify's own copy — it never
                // touches a linked GitHub repo (that's a separate thing you own
                // once pushed, not Breezify's to delete). Without one, there's
                // no copy anywhere else once this is gone.
                confirmTarget.githubUrl
                ? "This can't be undone. Its GitHub repo stays untouched, but this app's history, deploy, and any custom domain on Breezify will be gone."
                : "This can't be undone, and it was never pushed to GitHub or downloaded — there's no copy of this code anywhere else."
              : "Takes the app offline and frees up a subdomain slot for another app. The app itself, its code, and its history stay put — redeploy it any time."
          }
          confirmLabel={confirmTarget.kind === "delete" ? "Delete" : "Undeploy"}
          loading={confirming}
          error={confirmError}
          onClose={() => {
            if (!confirming) setConfirmTarget(null);
          }}
          onConfirm={async () => {
            setConfirming(true);
            setConfirmError("");
            try {
              if (confirmTarget.kind === "delete") {
                await deleteAppRequest(confirmTarget.id);
              } else {
                await undeployAppRequest(confirmTarget.id);
              }
              setConfirmTarget(null);
            } catch (err) {
              setConfirmError(
                err instanceof Error
                  ? err.message
                  : `Couldn't ${confirmTarget.kind} this app. Please try again.`
              );
            } finally {
              setConfirming(false);
            }
          }}
        />
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
