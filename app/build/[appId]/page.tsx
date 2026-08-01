"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { CodePreview } from "@/components/code-preview";
import { AppPreview } from "@/components/app-preview";
import { PromptComposer } from "@/components/prompt-composer";
import { GenerationProgress } from "@/components/generation-progress";
import { GithubPushDialog } from "@/components/github-push-dialog";
import { TurnCard } from "@/components/turn-card";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp, duplicateApp, revertToVersion } from "@/lib/use-apps";
import { useAuth } from "@/lib/auth-context";
import { fetchModelAvailability, generateAppRequest } from "@/lib/api-client";
import {
  DUPLICATE_MIN_PLAN,
  MODEL_INFO,
  PLAN_RANK,
  planAllowsModel,
  type ModelId,
  type PlanId,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { GithubIcon } from "@/components/oauth-icons";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Check,
  Code2,
  Copy,
  Eye,
  ExternalLink,
  Loader2,
  Lock,
  Pencil,
  Rocket,
  X,
} from "lucide-react";

type Pane = "preview" | "code";

function AppWorkspace() {
  const params = useParams<{ appId: string }>();
  const router = useRouter();
  const { app, loading } = useApp(params.appId);
  const { user, profile, refreshProfile } = useAuth();
  const plan: PlanId = profile?.plan ?? "free";
  const canDuplicate = PLAN_RANK[plan] >= PLAN_RANK[DUPLICATE_MIN_PLAN];

  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState<ModelId>("haiku");
  const [availability, setAvailability] = useState<Record<string, boolean>>();
  const [refining, setRefining] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ chars: 0, files: [] as string[] });
  const [error, setError] = useState("");
  const [showGithub, setShowGithub] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [pane, setPane] = useState<Pane>("preview");
  const conversationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchModelAvailability().then(setAvailability).catch(() => {});
  }, []);

  useEffect(() => {
    if (app?.model && planAllowsModel(plan, app.model)) setModel(app.model);
  }, [app?.model, plan]);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [app?.turns?.length, refining]);

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
  const hasFiles = Object.keys(files).length > 0;
  const cost = MODEL_INFO[model].credits;
  const insufficient = profile !== null && profile.credits < cost;
  const turns = app.turns ?? [];
  const suggestions = app.suggestions ?? [];

  async function refine(text: string) {
    setError("");
    setProgress({ chars: 0, files: [] });
    setStatus("Starting");
    setRefining(true);
    try {
      await generateAppRequest(
        text,
        model,
        { onStatus: setStatus, onProgress: setProgress },
        undefined,
        app!.id
      );
      setInstruction("");
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setRefining(false);
    }
  }

  async function saveName() {
    const next = nameDraft.trim();
    if (!next || next === app!.name) {
      setRenaming(false);
      return;
    }
    try {
      await updateDoc(doc(db, "apps", app!.id), { name: next });
    } catch {
      setError("Couldn't rename this app.");
    }
    setRenaming(false);
  }

  async function deployApp() {
    setDeployError("");
    setDeploying(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ appId: app!.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deploy failed.");
      // Firestore's onSnapshot in useApp() picks up the new deployedUrl/status
      // as soon as the server writes them; nothing else to do here.
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }

  async function duplicate() {
    if (!app || !user) return;
    setDuplicating(true);
    try {
      const newId = await duplicateApp(app, user.uid);
      router.push(`/build/${newId}`);
    } catch {
      setError("Couldn't duplicate this app.");
      setDuplicating(false);
    }
  }

  async function revert(turnId: string) {
    if (!app) return;
    setReverting(turnId);
    setError("");
    try {
      await revertToVersion(app, turnId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't revert to that version.");
    } finally {
      setReverting(null);
    }
  }

  return (
    <div className="-mx-5 -my-8 flex h-[calc(100vh-3.5rem)] flex-col md:-mx-10 md:-my-10 md:h-screen">
      {/* Workspace header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            onClick={() => router.push("/dashboard")}
            title="Back to dashboard"
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          {renaming ? (
            <div className="flex items-center gap-1">
              <Input
                value={nameDraft}
                autoFocus
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="h-8 w-56 text-sm font-medium"
              />
              <Button size="icon" variant="ghost" onClick={saveName} title="Save">
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setRenaming(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <h1 className="truncate font-medium">{app.name}</h1>
              <button
                onClick={() => {
                  setNameDraft(app!.name);
                  setRenaming(true);
                }}
                title="Rename"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <Pencil className="h-3 w-3" />
              </button>
            </>
          )}
          <StatusBadge status={app.status} />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {app.deployedUrl && PLAN_RANK[plan] >= PLAN_RANK.pro && (
            <span
              title="Page loads on the deployed app"
              className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground"
            >
              <BarChart3 className="h-3 w-3" />
              {app.visits ?? 0}
            </span>
          )}
          {hasFiles && app.deployedUrl && (
            <a href={app.deployedUrl} target="_blank" rel="noreferrer">
              <Button variant="ghost" size="sm">
                <Rocket className="h-4 w-4" />
                <span className="hidden sm:inline">Live</span>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </a>
          )}

          {hasFiles && (
            <Button
              size="sm"
              onClick={deployApp}
              loading={deploying || app.status === "deploying"}
            >
              {!(deploying || app.status === "deploying") && <Rocket className="h-4 w-4" />}
              <span className="hidden sm:inline">{app.deployedUrl ? "Redeploy" : "Deploy"}</span>
            </Button>
          )}

          {hasFiles &&
            (app.githubUrl ? (
              <a href={app.githubUrl} target="_blank" rel="noreferrer">
                <Button variant="ghost" size="sm">
                  <GithubIcon className="h-4 w-4" />
                  <span className="hidden sm:inline">Repo</span>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </a>
            ) : plan === "free" ? (
              <Link href="/billing" title="Upgrade to Plus to push to GitHub">
                <Button variant="ghost" size="sm">
                  <span className="relative inline-flex">
                    <GithubIcon className="h-4 w-4" />
                    <Lock
                      className="absolute -bottom-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-background text-muted-foreground"
                      strokeWidth={3}
                    />
                  </span>
                  <span className="hidden sm:inline">Push to GitHub</span>
                </Button>
              </Link>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowGithub(true)}>
                <GithubIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Push to GitHub</span>
              </Button>
            ))}

          {hasFiles &&
            (canDuplicate ? (
              <Button variant="ghost" size="sm" onClick={duplicate} loading={duplicating}>
                {!duplicating && <Copy className="h-4 w-4" />}
                <span className="hidden sm:inline">Duplicate</span>
              </Button>
            ) : (
              <Link href="/billing" title="Upgrade to Pro to duplicate this app">
                <Button variant="ghost" size="sm">
                  <Lock className="h-4 w-4" />
                  <span className="hidden sm:inline">Duplicate</span>
                </Button>
              </Link>
            ))}

          {hasFiles && (
            <div className="flex items-center rounded-lg border border-border p-0.5">
              {(["preview", "code"] as Pane[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPane(p)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                    pane === p
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {p === "preview" ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <Code2 className="h-3 w-3" />
                  )}
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Split: conversation left, output right */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 w-full flex-col border-b border-border lg:w-[420px] lg:shrink-0 lg:border-b-0 lg:border-r">
          <div ref={conversationRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Original brief
              </p>
              <p className="mt-1 text-sm leading-relaxed">{app.prompt}</p>
            </div>

            {turns.length === 0 && app.summary && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-sm leading-relaxed text-muted-foreground">{app.summary}</p>
              </div>
            )}

            {turns.map((turn, i) => (
              <TurnCard
                key={turn.id}
                turn={turn}
                files={files}
                isLatest={i === turns.length - 1}
                onRevert={() => revert(turn.id)}
                reverting={reverting === turn.id}
              />
            ))}

            {refining && (
              <GenerationProgress
                status={status}
                chars={progress.chars}
                files={progress.files}
                modelLabel={MODEL_INFO[model].label}
              />
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {deployError && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{deployError}</span>
              </div>
            )}
          </div>

          {hasFiles && (
            <div className="shrink-0 border-t border-border p-3">
              {!refining && suggestions.length > 0 && (
                <div className="mb-2.5 flex flex-wrap gap-1.5">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => refine(s)}
                      disabled={insufficient}
                      className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <PromptComposer
                value={instruction}
                onChange={setInstruction}
                model={model}
                onModelChange={setModel}
                plan={plan}
                availability={availability}
                onSubmit={refine}
                loading={refining}
                disabled={insufficient}
                placeholder={
                  insufficient ? "Out of credits" : "Describe a change to make..."
                }
              />
            </div>
          )}
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          {app.status === "generating" ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Generating your app...</p>
            </div>
          ) : app.status === "error" && !hasFiles ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="flex max-w-sm items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{app.errorMessage || "Something went wrong generating this app."}</span>
              </div>
            </div>
          ) : app.status === "stopped" && !hasFiles ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Generation was cancelled before it finished. No credits were charged.
              </p>
              <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard")}>
                Back to dashboard
              </Button>
            </div>
          ) : hasFiles ? (
            pane === "preview" ? (
              <AppPreview files={files} removeBadge={plan !== "free"} />
            ) : (
              <div className="h-full overflow-auto p-4">
                <CodePreview files={files} appName={app.name} locked={plan === "free"} />
              </div>
            )
          ) : null}
        </div>
      </div>

      {showGithub && (
        <GithubPushDialog
          appId={app.id}
          defaultName={app.name}
          onClose={() => setShowGithub(false)}
          onPushed={() => {}}
        />
      )}
    </div>
  );
}

export default function AppDetailPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <AppWorkspace />
      </AppShell>
    </ProtectedRoute>
  );
}
