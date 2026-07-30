"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { CodePreview } from "@/components/code-preview";
import { GenerationProgress } from "@/components/generation-progress";
import { GithubPushDialog } from "@/components/github-push-dialog";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/use-apps";
import { useAuth } from "@/lib/auth-context";
import { fetchModelAvailability, generateAppRequest } from "@/lib/api-client";
import { MODEL_INFO, planAllowsModel, type ModelId, type PlanId } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { GithubIcon } from "@/components/oauth-icons";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Pencil,
  Wand2,
  X,
} from "lucide-react";

function AppDetailContent() {
  const params = useParams<{ appId: string }>();
  const router = useRouter();
  const { app, loading } = useApp(params.appId);
  const { profile, refreshProfile } = useAuth();
  const plan: PlanId = profile?.plan ?? "free";

  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState<ModelId>("haiku");
  const [availability, setAvailability] = useState<Record<string, boolean>>();
  const [refining, setRefining] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ chars: 0, files: [] as string[] });
  const [error, setError] = useState("");
  const [showGithub, setShowGithub] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  useEffect(() => {
    fetchModelAvailability().then(setAvailability).catch(() => {});
  }, []);

  // Default the refine model to whatever built the app, when the plan allows.
  useEffect(() => {
    if (app?.model && planAllowsModel(plan, app.model)) setModel(app.model);
  }, [app?.model, plan]);

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

  async function refine() {
    if (instruction.trim().length < 5) {
      setError("Describe the change in a bit more detail.");
      return;
    }
    setError("");
    setProgress({ chars: 0, files: [] });
    setStatus("Starting");
    setRefining(true);
    try {
      await generateAppRequest(
        instruction,
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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            {renaming ? (
              <div className="flex items-center gap-1.5">
                <Input
                  value={nameDraft}
                  autoFocus
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setRenaming(false);
                  }}
                  className="h-9 w-64 text-lg font-semibold"
                />
                <Button size="icon" variant="ghost" onClick={saveName} title="Save">
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setRenaming(false)}
                  title="Cancel"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">{app.name}</h1>
                <button
                  onClick={() => {
                    setNameDraft(app!.name);
                    setRenaming(true);
                  }}
                  title="Rename"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            <StatusBadge status={app.status} />
          </div>
          {app.summary && (
            <p className="mt-1.5 text-sm text-muted-foreground">{app.summary}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            {MODEL_INFO[app.model]?.label ?? app.model} · Created {formatDate(app.createdAt)}
          </p>
        </div>

        {hasFiles && (
          <div className="flex items-center gap-2">
            {app.githubUrl ? (
              <a href={app.githubUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary" size="sm">
                  <GithubIcon className="h-4 w-4" />
                  View repo
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setShowGithub(true)}>
                <GithubIcon className="h-4 w-4" />
                Push to GitHub
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Original brief</p>
        <p className="mt-1.5 text-sm leading-relaxed">{app.prompt}</p>
      </div>

      {hasFiles && (
        <div className="mt-6 rounded-lg border border-border p-4">
          <label htmlFor="refine" className="text-sm font-medium">
            Make a change
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Describe what to change and Feather 123 rewrites the affected files.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Input
              id="refine"
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !refining) refine();
              }}
              disabled={refining}
              placeholder="Add dark mode and a settings page"
              className="flex-1"
            />
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelId)}
              disabled={refining}
              className="h-10 rounded border border-border bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
            >
              {(Object.keys(MODEL_INFO) as ModelId[])
                .filter(
                  (id) =>
                    planAllowsModel(plan, id) &&
                    (availability ? availability[id] !== false : true)
                )
                .map((id) => (
                  <option key={id} value={id}>
                    {MODEL_INFO[id].label} · {MODEL_INFO[id].credits.toFixed(2)}
                  </option>
                ))}
            </select>
            <Button onClick={refine} loading={refining} disabled={insufficient}>
              {!refining && <Wand2 className="h-4 w-4" />}
              {insufficient ? "No credits" : "Update"}
            </Button>
          </div>

          {refining && (
            <div className="mt-4">
              <GenerationProgress
                status={status}
                chars={progress.chars}
                files={progress.files}
                modelLabel={MODEL_INFO[model].label}
              />
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mt-8">
        {app.status === "generating" && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Generating your app...</p>
          </div>
        )}

        {app.status === "error" && (
          <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{app.errorMessage || "Something went wrong generating this app."}</span>
          </div>
        )}

        {hasFiles && <CodePreview files={files} appName={app.name} />}
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
        <AppDetailContent />
      </AppShell>
    </ProtectedRoute>
  );
}
