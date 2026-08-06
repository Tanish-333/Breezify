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
import { useApp, useAppSecrets, useMyCollaboratorRole, revertToVersion, saveManualEdit, toggleStarredApp } from "@/lib/use-apps";
import { usePresence } from "@/lib/use-presence";
import { missingEnvVars } from "@/lib/backend-env";
import { useAuth } from "@/lib/auth-context";
import { fetchModelAvailability, generateAppRequest, duplicateAppRequest, renewAppRequest } from "@/lib/api-client";
import {
  canRenewDeploy,
  COLLABORATOR_MIN_PLAN,
  CUSTOM_DOMAIN_MIN_PLAN,
  displayStatus,
  DUPLICATE_MIN_PLAN,
  effectiveDeployStatus,
  IMPORT_MIN_PLAN,
  isDeployExpired,
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
  Clock,
  Code2,
  Copy,
  Eye,
  ExternalLink,
  Globe,
  KeyRound,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Rocket,
  Star,
  Users,
  X,
} from "lucide-react";

type Pane = "preview" | "code";

/** One row in the workspace header's "More" menu — a link (external or locked-upsell) or an action button, never both. */
function MenuItem({
  icon: Icon,
  label,
  onClick,
  href,
  external,
  locked,
  disabled,
  disabledTitle,
  warn,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  locked?: boolean;
  disabled?: boolean;
  disabledTitle?: string;
  warn?: boolean;
}) {
  const rowClassName = cn(
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
    disabled ? "cursor-not-allowed text-muted-foreground/50" : "hover:bg-muted"
  );
  const content = (
    <>
      <span className="relative inline-flex shrink-0">
        <Icon className="h-4 w-4" />
        {locked && (
          <Lock
            className="absolute -bottom-1 -right-1.5 h-2.5 w-2.5 rounded-full bg-background text-muted-foreground"
            strokeWidth={3}
          />
        )}
        {warn && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning" />}
      </span>
      <span className="flex-1">{label}</span>
      {external && <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className={rowClassName}
        title={locked ? "Upgrade to unlock" : undefined}
      >
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={disabledTitle} className={rowClassName}>
      {content}
    </button>
  );
}

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
  // A collaborator invited as "viewer" gets read-only access — this mirrors
  // firestore.rules' isAppEditor and lib/app-collaborators.ts's
  // hasEditAccess, which are what actually enforce it; this is just what
  // keeps the UI from showing controls that would fail on click. Missing
  // role (still loading, or the owner who has no collaborator doc at all)
  // defaults to allowed, same back-compat-safe default used everywhere else.
  const { role: myRole } = useMyCollaboratorRole(app?.id, user?.uid);
  const canEdit = isOwner || myRole !== "viewer";
  // Starring is a per-viewer preference (users/{uid}.starredAppIds, see
  // lib/use-apps.ts), not gated by canEdit — a Viewer can star same as anyone.
  const starred = app ? (profile?.starredAppIds ?? []).includes(app.id) : false;

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
  const [renewing, setRenewing] = useState(false);
  const [renewError, setRenewError] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const [reverting, setReverting] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [pane, setPane] = useState<Pane>("preview");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const conversationRef = useRef<HTMLDivElement>(null);
  const autoDeployedRef = useRef<string | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchModelAvailability().then(setAvailability).catch(() => {});
  }, []);

  // Close the header's "More" menu on an outside click, same pattern as the
  // model picker in PromptComposer.
  useEffect(() => {
    if (!moreMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (!moreMenuRef.current?.contains(e.target as Node)) setMoreMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreMenuOpen]);

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

  // Free-tier subdomain expiry (DEPLOY_EXPIRY_DAYS) — unset entirely on
  // plans that never expire, see app/api/deploy/route.ts.
  const deployExpired = isDeployExpired(app.deployExpiresAt);
  const deployRenewable = canRenewDeploy(app.deployExpiresAt);
  const daysUntilExpiry =
    app.deployExpiresAt ? Math.ceil((app.deployExpiresAt - Date.now()) / (24 * 60 * 60 * 1000)) : null;

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

  async function renewApp() {
    setRenewError("");
    setRenewing(true);
    try {
      await renewAppRequest(app!.id);
      // Firestore's onSnapshot in useApp() picks up the new deployExpiresAt
      // as soon as the server writes it.
    } catch (err) {
      setRenewError(err instanceof Error ? err.message : "Couldn't renew this app.");
    } finally {
      setRenewing(false);
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
              {canEdit && (
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
              )}
            </>
          )}
          <StatusBadge status={displayStatus(app.status)} />
          <DeployBadge status={effectiveDeployStatus(app)} />
          {user && (
            <button
              onClick={() => toggleStarredApp(user.uid, app.id, starred)}
              title={starred ? "Unstar" : "Star"}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Star className={cn("h-3.5 w-3.5", starred && "fill-current text-foreground")} />
            </button>
          )}
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
          {isOwner && app.deployExpiresAt && (
            <span
              title={
                deployExpired
                  ? "This app's link has expired — renew it to bring it back"
                  : "This free-plan app auto-expires unless renewed"
              }
              className={cn(
                "flex items-center gap-1 rounded-full border px-2 py-1 text-xs",
                deployExpired
                  ? "border-error/30 text-error"
                  : deployRenewable
                    ? "border-amber-500/30 text-amber-600 dark:text-amber-400"
                    : "border-border text-muted-foreground"
              )}
            >
              <Clock className="h-3 w-3" />
              {deployExpired ? "Expired" : `Expires in ${daysUntilExpiry}d`}
            </span>
          )}
          {isOwner && deployRenewable && (
            <Button size="sm" variant="secondary" onClick={renewApp} loading={renewing}>
              {!renewing && <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">Renew</span>
            </Button>
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

          {hasFiles && canEdit && (
            <Button
              size="sm"
              onClick={deployApp}
              loading={deploying || effectiveDeployStatus(app) === "deploying"}
            >
              {!(deploying || effectiveDeployStatus(app) === "deploying") && <Rocket className="h-4 w-4" />}
              <span className="hidden sm:inline">{app.deployedUrl ? "Redeploy" : "Deploy"}</span>
            </Button>
          )}

          {hasFiles && (
            <div className="relative" ref={moreMenuRef}>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setMoreMenuOpen((o) => !o)}
                title="More actions"
              >
                <span className="relative inline-flex">
                  <MoreHorizontal className="h-4 w-4" />
                  {isOwner && missingSecrets.length > 0 && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-warning" />
                  )}
                </span>
              </Button>
              {moreMenuOpen && (
                <div className="absolute right-0 top-full z-20 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-xl animate-in">
                  {app.githubUrl && canEdit && (
                    canSyncGithub ? (
                      <MenuItem
                        icon={RefreshCw}
                        label="Sync from GitHub"
                        onClick={() => {
                          setShowSync(true);
                          setMoreMenuOpen(false);
                        }}
                      />
                    ) : (
                      <MenuItem icon={RefreshCw} label="Sync from GitHub" href="/billing" locked />
                    )
                  )}

                  {app.githubUrl ? (
                    <MenuItem icon={GithubIcon} label="View repo" href={app.githubUrl} external />
                  ) : !canEdit ? null : plan === "free" ? (
                    <MenuItem icon={GithubIcon} label="Push to GitHub" href="/billing" locked />
                  ) : (
                    <MenuItem
                      icon={GithubIcon}
                      label="Push to GitHub"
                      onClick={() => {
                        setShowGithub(true);
                        setMoreMenuOpen(false);
                      }}
                    />
                  )}

                  {!canEdit ? null : canDuplicate ? (
                    <MenuItem
                      icon={Copy}
                      label="Duplicate"
                      onClick={() => {
                        setMoreMenuOpen(false);
                        duplicate();
                      }}
                      disabled={duplicating}
                    />
                  ) : (
                    <MenuItem icon={Copy} label="Duplicate" href="/billing" locked />
                  )}

                  {isOwner && (
                    <MenuItem
                      icon={KeyRound}
                      label="Secrets"
                      warn={missingSecrets.length > 0}
                      disabledTitle={
                        missingSecrets.length > 0
                          ? `Missing ${missingSecrets.join(", ")} — this app's backend won't work without them`
                          : undefined
                      }
                      onClick={() => {
                        setShowSecrets(true);
                        setMoreMenuOpen(false);
                      }}
                    />
                  )}

                  {!isOwner || canInviteCollaborators ? (
                    <MenuItem
                      icon={Users}
                      label="Team"
                      onClick={() => {
                        setShowCollaborators(true);
                        setMoreMenuOpen(false);
                      }}
                    />
                  ) : (
                    <MenuItem icon={Users} label="Team" href="/billing" locked />
                  )}

                  {isOwner && (
                    !canCustomDomain ? (
                      <MenuItem icon={Globe} label="Domain" href="/billing" locked />
                    ) : !app.deployedUrl ? (
                      // A domain attaches to a deployed project on Vercel, so
                      // there's nothing to attach it to yet — disabled rather
                      // than hidden, so a Pro+ owner can still find it instead
                      // of wondering where it went.
                      <MenuItem
                        icon={Globe}
                        label="Domain"
                        disabled
                        disabledTitle="Deploy your app first — a custom domain attaches to the deployed version."
                      />
                    ) : (
                      <MenuItem
                        icon={Globe}
                        label="Domain"
                        onClick={() => {
                          setShowDomain(true);
                          setMoreMenuOpen(false);
                        }}
                      />
                    )
                  )}
                </div>
              )}
            </div>
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
                onRevert={canEdit ? () => revert(turn.id) : undefined}
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

            {renewError && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{renewError}</span>
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
                    {canEdit
                      ? `The live preview hit a runtime error. Fixing it runs a refine like any other — ${cost.toFixed(2)} credits with ${MODEL_INFO[model].label}.`
                      : "The live preview hit a runtime error."}
                  </p>
                  <pre className="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap break-words rounded bg-error/10 p-2 font-mono text-xs">
                    {previewError}
                  </pre>
                </div>
                {canEdit && (
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
                )}
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

          {hasFiles && canEdit && (
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
          {hasFiles && !canEdit && (
            <div className="shrink-0 border-t border-border p-3">
              <p className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-center text-xs text-muted-foreground">
                <Eye className="mr-1.5 inline h-3.5 w-3.5" />
                You have view-only access to this app.
              </p>
            </div>
          )}
        </div>

        <div className="relative min-h-0 min-w-0 flex-1">
          {app.status === "generating" && !hasFiles ? (
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
            <>
              {/* A refine of an already-built app keeps the last working preview
                  on screen instead of blanking it — losing it made every refine
                  feel like starting over instead of live-editing. Only a brand
                  new build (no files yet, handled above) still gets the
                  full-screen spinner, since there's nothing to show underneath it. */}
              {app.status === "generating" && (
                <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 border-b border-border bg-background/90 px-3 py-2 text-xs text-muted-foreground backdrop-blur-sm">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Updating your app...
                </div>
              )}
              {pane === "preview" ? (
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
                    editable={plan !== "free" && !blockedByOtherEditor && canEdit}
                    onSave={saveEdit}
                    versionKey={turns.length}
                  />
                </div>
              )}
            </>
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
