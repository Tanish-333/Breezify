"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { CodePreview } from "@/components/code-preview";
import { AppPreview } from "@/components/app-preview";
import { PromptComposer } from "@/components/prompt-composer";
import { GenerationProgress } from "@/components/generation-progress";
import { GithubPushDialog } from "@/components/github-push-dialog";
import { GithubSyncDialog } from "@/components/github-sync-dialog";
import { AppSecretsDialog } from "@/components/app-secrets-dialog";
import { CustomDomainDialog } from "@/components/custom-domain-dialog";
import { CollaboratorsDialog } from "@/components/collaborators-dialog";
import { TurnCard } from "@/components/turn-card";
import { StatusBadge, DeployBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp, useAppSecrets, revertToVersion, saveManualEdit } from "@/lib/use-apps";
import { usePresence } from "@/lib/use-presence";
import { missingEnvVars } from "@/lib/backend-env";
import { useAuth } from "@/lib/auth-context";
import { fetchModelAvailability, generateAppRequest, duplicateAppRequest } from "@/lib/api-client";
import {
  COLLABORATOR_MIN_PLAN,
  CUSTOM_DOMAIN_MIN_PLAN,
  displayStatus,
  DUPLICATE_MIN_PLAN,
  effectiveDeployStatus,
  IMPORT_MIN_PLAN,
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
  Globe,
  KeyRound,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Rocket,
  Users,
  X,
} from "lucide-react";

type Pane = "preview" | "code";

function AppWorkspace() {
  const params = useParams<{ appId: string }>();
  const searchParams = useSearchParams();
  const domainCheckout = searchParams.get("domain");
  const router = useRouter();
  const { app, loading } = useApp(params.appId);
  const { user, profile, refreshProfile } = useAuth();
  const plan: PlanId = profile?.plan ?? "free";
  const canDuplicate = PLAN_RANK[plan] >= PLAN_RANK[DUPLICATE_MIN_PLAN];
  // GitHub sync shares Push/Import's Plus-and-up gate (also enforced
  // server-side in app/api/github/sync).
  const canSyncGithub = PLAN_RANK[plan] >= PLAN_RANK[IMPORT_MIN_PLAN];
  const canCustomDomain = PLAN_RANK[plan] >= PLAN_RANK[CUSTOM_DOMAIN_MIN_PLAN];
  const isOwner = app?.userId === user?.uid;
  const canInviteCollaborators = PLAN_RANK[plan] >= PLAN_RANK[COLLABORATOR_MIN_PLAN];
  const otherViewers = usePresence(app?.id, user?.uid, user?.email);
  const { secrets: appSecrets } = useAppSecrets(isOwner ? app?.id : undefined);

  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState<ModelId>("haiku");
  const [availability, setAvailability] = useState<Record<string, boolean>>();
  const [refining, setRefining] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ chars: 0, files: [] as string[] });
  const [error, setError] = useState("");
  const [showGithub, setShowGithub] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [showDomain, setShowDomain] = useState(false);
  const [showCollaborators, setShowCollaborators] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [deployError, setDeployError] = useState("");
  const [deployNote, setDeployNote] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [pane, setPane] = useState<Pane>("preview");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const autoDeployedRef = useRef<string | null>(null);

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

  // A new turn means new file content, which the previous preview error may
  // no longer even apply to (it could already be fixed, or the error could
  // be about code that no longer exists).
  useEffect(() => {
    setPreviewError(null);
  }, [app?.turns?.length]);

  // Auto-deploy straight to a live production URL the moment a brand-new
  // app finishes its first build, rather than making "Deploy" a manual step
  // nobody discovers. Only fires once per app, only for the owner (so it
  // spends the owner's own daily deploy quota, same as a manual click
  // would), and only for the very first build turn — a refine never
  // re-triggers it, so redeploying an already-live app stays an explicit
  // "Redeploy" click. An app that can't be deployed (e.g. a real always-on
  // server) still just shows the same deploy-error banner a manual click
  // would have produced.
  useEffect(() => {
    if (!app || !user || app.userId !== user.uid) return;
    if (autoDeployedRef.current === app.id) return;
    const files = app.generatedCode?.files ?? {};
    if (Object.keys(files).length === 0) return;
    const turns = app.turns ?? [];
    const isFreshBuild = turns.length === 1 && turns[0].kind === "build";
    if (!isFreshBuild || app.deployedUrl || effectiveDeployStatus(app) === "deploying") return;
    autoDeployedRef.current = app.id;
    deployApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app?.id, app?.turns?.length, user?.uid]);

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
  // A refine claims a lock on the app doc server-side (see app/api/generate/
  // route.ts) so two collaborators refining at once can't silently clobber
  // one another — this just keeps the composer from submitting a refine
  // that server would reject anyway.
  const blockedByOtherEditor =
    app.status === "generating" && !!app.generatingBy && app.generatingBy !== user?.uid;
  // Flags a backend that reads process.env.<KEY> for a key nobody's
  // configured yet — see lib/backend-env.ts. Deploy itself re-checks this
  // server-side (app/api/deploy/route.ts); this is what surfaces it before
  // someone even tries to deploy.
  const missingSecrets = isOwner ? missingEnvVars(files, appSecrets.map((s) => s.key)) : [];

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
      // A successful refine (e.g. "Fix this error") produces new files that
      // the preview reloads with, but the old error banner otherwise stuck
      // around until a manual Reload click — even once the fix actually
      // worked, it still looked broken.
      setPreviewError(null);
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
    setDeployNote("");
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
      // as soon as the server writes them; the deploy can still succeed with
      // a caveat worth surfacing though (e.g. a collaborator's deploy
      // shipping without the owner's secrets, or an Express backend that got
      // auto-wrapped) — that's carried in `note`, not an error.
      if (data.note) setDeployNote(data.note);
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
      const newId = await duplicateAppRequest(app.id);
      router.push(`/build/${newId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't duplicate this app.");
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

  async function saveEdit(editedFiles: Record<string, string>) {
    if (!app) throw new Error("App not loaded yet.");
    await saveManualEdit(app, editedFiles);
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
          <StatusBadge status={displayStatus(app.status)} />
          <DeployBadge status={effectiveDeployStatus(app)} />
          {otherViewers.length > 0 && (
            <span
              title={`Also here right now: ${otherViewers.map((v) => v.email || "another collaborator").join(", ")}`}
              className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              <Users className="h-3 w-3" />
              {otherViewers.length}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {app.deployedUrl && (
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
              loading={deploying || effectiveDeployStatus(app) === "deploying"}
            >
              {!(deploying || effectiveDeployStatus(app) === "deploying") && <Rocket className="h-4 w-4" />}
              <span className="hidden sm:inline">{app.deployedUrl ? "Redeploy" : "Deploy"}</span>
            </Button>
          )}

          {hasFiles && app.githubUrl && (
            canSyncGithub ? (
              <Button variant="ghost" size="sm" onClick={() => setShowSync(true)}>
                <RefreshCw className="h-4 w-4" />
                <span className="hidden sm:inline">Sync</span>
              </Button>
            ) : (
              <Link href="/billing" title="Upgrade to Plus to pull the latest commit">
                <Button variant="ghost" size="sm">
                  <span className="relative inline-flex">
                    <RefreshCw className="h-4 w-4" />
                    <Lock
                      className="absolute -bottom-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-background text-muted-foreground"
                      strokeWidth={3}
                    />
                  </span>
                  <span className="hidden sm:inline">Sync</span>
                </Button>
              </Link>
            )
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

          {hasFiles && isOwner && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSecrets(true)}
              title={
                missingSecrets.length > 0
                  ? `Missing ${missingSecrets.join(", ")} — this app's backend won't work without them`
                  : undefined
              }
            >
              <span className="relative inline-flex">
                <KeyRound className="h-4 w-4" />
                {missingSecrets.length > 0 && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning" />
                )}
              </span>
              <span className="hidden sm:inline">Secrets</span>
            </Button>
          )}

          {hasFiles && (
            !isOwner || canInviteCollaborators ? (
              <Button variant="ghost" size="sm" onClick={() => setShowCollaborators(true)}>
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Team</span>
              </Button>
            ) : (
              <Link href="/billing" title="Upgrade to Plus to invite collaborators">
                <Button variant="ghost" size="sm">
                  <span className="relative inline-flex">
                    <Users className="h-4 w-4" />
                    <Lock
                      className="absolute -bottom-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-background text-muted-foreground"
                      strokeWidth={3}
                    />
                  </span>
                  <span className="hidden sm:inline">Team</span>
                </Button>
              </Link>
            )
          )}

          {hasFiles && isOwner && (
            !canCustomDomain ? (
              <Link href="/billing" title="Upgrade to Pro to attach a custom domain">
                <Button variant="ghost" size="sm">
                  <span className="relative inline-flex">
                    <Globe className="h-4 w-4" />
                    <Lock
                      className="absolute -bottom-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-background text-muted-foreground"
                      strokeWidth={3}
                    />
                  </span>
                  <span className="hidden sm:inline">Domain</span>
                </Button>
              </Link>
            ) : !app.deployedUrl ? (
              // A domain attaches to a deployed project on Vercel, so there's
              // nothing to attach it to yet — disabled rather than hidden,
              // so a Pro+ owner can actually find this instead of wondering
              // where it went.
              <Button
                variant="ghost"
                size="sm"
                disabled
                title="Deploy your app first — a custom domain attaches to the deployed version."
              >
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">Domain</span>
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setShowDomain(true)}>
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">Domain</span>
              </Button>
            )
          )}

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
                appId={app.id}
                turn={turn}
                files={files}
                isLatest={i === turns.length - 1}
                onRevert={() => revert(turn.id)}
                reverting={reverting === turn.id}
                revertLocked={reverting !== null}
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
                <pre className="max-h-48 flex-1 overflow-y-auto whitespace-pre-wrap break-words font-sans">
                  {deployError}
                </pre>
              </div>
            )}

            {deployNote && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{deployNote}</span>
              </div>
            )}

            {hasFiles && missingSecrets.length > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="flex-1">
                  This app&apos;s backend expects {missingSecrets.join(", ")} but{" "}
                  {missingSecrets.length > 1 ? "they aren't" : "it isn't"} configured yet — those
                  requests will fail once deployed.
                </span>
                <button
                  onClick={() => setShowSecrets(true)}
                  className="shrink-0 font-medium underline hover:text-foreground"
                >
                  Configure
                </button>
              </div>
            )}

            {previewError && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p>
                    The live preview hit a runtime error. Fixing it runs a refine like any other —
                    {" "}{cost.toFixed(2)} credits with {MODEL_INFO[model].label}.
                  </p>
                  <pre className="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded bg-error/10 p-2 font-mono text-xs">
                    {previewError}
                  </pre>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  loading={refining}
                  disabled={refining || insufficient || blockedByOtherEditor}
                  onClick={() =>
                    refine(`Fix this runtime error from the live preview:\n\n${previewError}`)
                  }
                >
                  Fix this error · {cost.toFixed(2)}
                </Button>
              </div>
            )}

            {blockedByOtherEditor && (
              <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
                <span>
                  {app.generatingByEmail ?? "Someone else"} is refining or syncing this app right now
                  — your own change will be blocked until they finish, to avoid the two overwriting
                  each other.
                </span>
              </div>
            )}

            {domainCheckout === "purchased" && (
              <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
                <Check className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Payment received — registering your domain and attaching it to this app. This can
                  take a minute; open the Domain panel to check status.
                </span>
              </div>
            )}
            {domainCheckout === "canceled" && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Domain purchase canceled — you weren&apos;t charged.</span>
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
                disabled={insufficient || blockedByOtherEditor}
                placeholder={
                  insufficient
                    ? "Out of credits"
                    : blockedByOtherEditor
                      ? "Wait for the other refine in progress to finish..."
                      : "Describe a change to make..."
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
              <AppPreview
                files={files}
                removeBadge={plan !== "free"}
                onError={setPreviewError}
                onReload={() => setPreviewError(null)}
                reloadKey={turns.length}
              />
            ) : (
              <div className="h-full overflow-auto p-4">
                <CodePreview
                  files={files}
                  appName={app.name}
                  locked={plan === "free"}
                  editable={plan !== "free" && !blockedByOtherEditor}
                  onSave={saveEdit}
                  versionKey={turns.length}
                />
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

      {showSync && app.githubUrl && (
        <GithubSyncDialog
          appId={app.id}
          repoUrl={app.githubUrl}
          onClose={() => setShowSync(false)}
          onSynced={() => {}}
        />
      )}

      {showSecrets && <AppSecretsDialog appId={app.id} onClose={() => setShowSecrets(false)} />}

      {showDomain && (
        <CustomDomainDialog
          appId={app.id}
          currentDomain={app.customDomain}
          domainPurchased={app.domainPurchased}
          domainExpiresAt={app.domainExpiresAt}
          domainAutoRenew={app.domainAutoRenew}
          onClose={() => setShowDomain(false)}
        />
      )}

      {showCollaborators && (
        <CollaboratorsDialog appId={app.id} isOwner={isOwner} onClose={() => setShowCollaborators(false)} />
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
