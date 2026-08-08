"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { friendlyAuthError } from "@/lib/auth-errors";
import { downloadUserData } from "@/lib/export-data";
import { deleteAllVercelProjectsRequest } from "@/lib/api-client";
import { formatCredits, cn } from "@/lib/utils";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { getDefaultModel, setDefaultModel } from "@/lib/preferences";
import { MODEL_IDS, MODEL_INFO, planAllowsModel, type ModelId, type PlanId } from "@/lib/types";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  Download,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  X,
} from "lucide-react";

const PROVIDER_LABELS: Record<string, string> = {
  "password": "Email & password",
  "google.com": "Google",
  "github.com": "GitHub",
  "apple.com": "Apple",
};

/** A small pill switch — the only place Settings needs one, so it isn't a shared component (yet). */
function Switch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
        checked ? "bg-foreground" : "bg-muted"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

/** Hidden (not unmounted, so form state inside survives) when it doesn't match the search query. */
function Section({
  title,
  keywords,
  query,
  children,
}: {
  title: string;
  /** Extra terms a search should also match, beyond the visible title (e.g. "dark mode" for a card titled "Appearance"). */
  keywords: string;
  query: string;
  children: React.ReactNode;
}) {
  const q = query.trim().toLowerCase();
  const matches = !q || `${title} ${keywords}`.toLowerCase().includes(q);
  return <div className={matches ? "" : "hidden"}>{children}</div>;
}

/** A labeled cluster of Sections — pure visual grouping, doesn't affect search matching (each Section still matches independently). */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingsContent() {
  const router = useRouter();
  const { user, profile, changePassword, reauthenticateWithPassword, deleteAccount, signOut } =
    useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteVercelError, setDeleteVercelError] = useState("");
  const [deleteVercelLoading, setDeleteVercelLoading] = useState(false);
  const [deleteVercelResult, setDeleteVercelResult] = useState<number | null>(null);
  const [showDeleteVercelConfirm, setShowDeleteVercelConfirm] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // DEPLOY_DOMAIN is server-only (see lib/deploy-domain.ts) — it can't be
  // read via process.env in this client component, so it's fetched from a
  // tiny API route instead. undefined = still loading, null = not set.
  const [deployDomain, setDeployDomain] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/deploy-domain")
      .then((res) => res.json())
      .then((data) => setDeployDomain(data.domain ?? null))
      .catch(() => setDeployDomain(null));
  }, []);

  // Firebase rejects a password change once the session's gotten old enough
  // (auth/requires-recent-login) until identity is re-proven. Rather than
  // dead-ending on that error, ask for the current password inline and
  // retry the same change right after.
  const [needsReauth, setNeedsReauth] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [reauthError, setReauthError] = useState("");
  const [reauthLoading, setReauthLoading] = useState(false);

  const [emailVerified, setEmailVerified] = useState(user?.emailVerified ?? false);

  const [search, setSearch] = useState("");

  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    setThemeState(getTheme());
  }, []);
  function applyTheme(next: Theme) {
    setTheme(next);
    setThemeState(next);
  }

  const plan: PlanId = profile?.plan ?? "free";
  const [defaultModel, setDefaultModelState] = useState<ModelId | null>(null);
  useEffect(() => {
    setDefaultModelState(getDefaultModel());
  }, []);
  function chooseDefaultModel(id: ModelId | null) {
    setDefaultModel(id);
    setDefaultModelState(id);
  }

  const [notifLoading, setNotifLoading] = useState(false);
  const [notifError, setNotifError] = useState("");
  async function toggleEmailNotifications(next: boolean) {
    if (!user) return;
    setNotifError("");
    setNotifLoading(true);
    try {
      await updateDoc(doc(db, "users", user.uid), { emailNotifications: next });
    } catch {
      setNotifError("Couldn't save that preference. Please try again.");
    } finally {
      setNotifLoading(false);
    }
  }

  // The cached Auth user can be stale if verification happened in another
  // tab or a previous session; refresh it once so this doesn't show "Not
  // verified" for an already-verified account.
  useEffect(() => {
    if (!user) return;
    setEmailVerified(user.emailVerified);
    user.reload().then(() => setEmailVerified(user.emailVerified));
  }, [user]);

  const providers = profile?.authProviders ?? [];
  const hasPassword = providers.includes("password");

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError("");
    setPwSuccess(false);
    setPwLoading(true);
    try {
      await changePassword(newPassword);
      setPwSuccess(true);
      setNewPassword("");
    } catch (err) {
      if ((err as { code?: string })?.code === "auth/requires-recent-login") {
        setNeedsReauth(true);
      } else {
        setPwError(friendlyAuthError(err));
      }
    } finally {
      setPwLoading(false);
    }
  }

  async function handleReauth(e: React.FormEvent) {
    e.preventDefault();
    setReauthError("");
    setReauthLoading(true);
    try {
      await reauthenticateWithPassword(currentPassword);
      await changePassword(newPassword);
      setNeedsReauth(false);
      setCurrentPassword("");
      setNewPassword("");
      setPwSuccess(true);
    } catch (err) {
      setReauthError(friendlyAuthError(err));
    } finally {
      setReauthLoading(false);
    }
  }

  async function handleExport() {
    if (!user) return;
    setExportError("");
    setExportLoading(true);
    try {
      await downloadUserData(user.uid, profile);
    } catch {
      setExportError("Couldn't export your data. Please try again.");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleDelete() {
    setDeleteError("");
    setDeleteLoading(true);
    try {
      await deleteAccount();
      router.push("/");
    } catch (err) {
      setDeleteError(friendlyAuthError(err));
      setShowDeleteConfirm(false);
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleDeleteAllVercelProjects() {
    setDeleteVercelError("");
    setDeleteVercelResult(null);
    setDeleteVercelLoading(true);
    try {
      const { count } = await deleteAllVercelProjectsRequest();
      setDeleteVercelResult(count);
      setShowDeleteVercelConfirm(false);
    } catch (err) {
      setDeleteVercelError(err instanceof Error ? err.message : "Couldn't delete your Vercel projects.");
    } finally {
      setDeleteVercelLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search settings..."
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <Group label="Account">
        <Section title="Profile" keywords="account name email verification plan credits balance" query={search}>
          <Card>
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span>{user?.displayName || "Not set"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Email</span>
                <span>{user?.email}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Email verified</span>
                {emailVerified ? (
                  <span className="flex items-center gap-1 text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                  </span>
                ) : (
                  <span className="text-warning">Not verified</span>
                )}
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Plan</span>
                <span className="capitalize">{profile?.plan}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Credit balance</span>
                <span>{profile ? formatCredits(profile.credits) : "Loading"}</span>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Connected providers" keywords="sign in login google github apple password oauth" query={search}>
          <Card>
            <CardHeader>
              <CardTitle>Connected providers</CardTitle>
              <CardDescription>Sign-in methods linked to your account.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {providers.length === 0 && (
                <span className="text-sm text-muted-foreground">No providers linked.</span>
              )}
              {providers.map((p) => (
                <Badge key={p} className="gap-1.5">
                  <ShieldCheck className="h-3 w-3" />
                  {PROVIDER_LABELS[p] || p}
                </Badge>
              ))}
            </CardContent>
          </Card>
        </Section>

        {hasPassword && (
        <Section title="Change password" keywords="security credentials login" query={search}>
          <Card>
            <CardHeader>
              <CardTitle>Change password</CardTitle>
            </CardHeader>
            <CardContent>
              {pwError && (
                <div className="mb-4 flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{pwError}</span>
                </div>
              )}
              {pwSuccess && (
                <div className="mb-4 flex items-start gap-2 rounded border border-success/30 bg-success/5 p-3 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Password updated.</span>
                </div>
              )}
              <form onSubmit={handlePasswordChange} className="flex items-end gap-3">
                <div className="flex-1">
                  <Label htmlFor="new-password">New password</Label>
                  <Input
                    id="new-password"
                    type="password"
                    minLength={6}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 6 characters"
                  />
                </div>
                <Button type="submit" loading={pwLoading}>
                  Update
                </Button>
              </form>

              {needsReauth && (
                <form onSubmit={handleReauth} className="mt-4 space-y-3 border-t border-border pt-4">
                  <p className="text-sm text-muted-foreground">
                    For your security, confirm your current password to continue.
                  </p>
                  {reauthError && (
                    <div className="flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{reauthError}</span>
                    </div>
                  )}
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label htmlFor="current-password">Current password</Label>
                      <Input
                        id="current-password"
                        type="password"
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Your current password"
                      />
                    </div>
                    <Button type="submit" loading={reauthLoading}>
                      Confirm
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </Section>
        )}
      </Group>

      <Group label="Preferences">
        <Section title="Appearance" keywords="theme dark mode light mode display color" query={search}>
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <CardDescription>How Breezify looks on this device.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Theme</span>
                <div className="flex items-center rounded-lg border border-border p-0.5">
                  <button
                    onClick={() => applyTheme("light")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      theme === "light" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Sun className="h-3.5 w-3.5" />
                    Light
                  </button>
                  <button
                    onClick={() => applyTheme("dark")}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      theme === "dark" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Moon className="h-3.5 w-3.5" />
                    Dark
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Generation defaults" keywords="default model haiku sonnet opus gemini groq ai builder preference" query={search}>
          <Card>
            <CardHeader>
              <CardTitle>Generation defaults</CardTitle>
              <CardDescription>
                The model pre-selected when you start a new app. You can still change it per-generation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => chooseDefaultModel(null)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    defaultModel === null
                      ? "border-foreground bg-foreground text-background"
                      : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                  )}
                >
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  Fastest available
                </button>
                {MODEL_IDS.filter((id) => planAllowsModel(plan, id)).map((id) => (
                  <button
                    key={id}
                    onClick={() => chooseDefaultModel(id)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      defaultModel === id
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                    )}
                  >
                    {MODEL_INFO[id].label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </Section>

        <Section title="Notifications" keywords="email collaborator invite alerts" query={search}>
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Control which emails Breezify sends you.</CardDescription>
            </CardHeader>
            <CardContent>
              {notifError && (
                <div className="mb-3 flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{notifError}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-4 text-sm">
                <div className="flex items-start gap-2">
                  <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p>Collaborator invites</p>
                    <p className="text-xs text-muted-foreground">
                      Email me when someone invites me to work on their app.
                    </p>
                  </div>
                </div>
                <Switch
                  checked={profile?.emailNotifications ?? true}
                  onChange={toggleEmailNotifications}
                  disabled={notifLoading || !profile}
                  label="Toggle collaborator invite emails"
                />
              </div>
            </CardContent>
          </Card>
        </Section>
      </Group>

      <Group label="Deployment">
        <Section title="Deployment domain" keywords="deploy domain vercel custom domain breezify.dev" query={search}>
          <Card>
            <CardHeader>
              <CardTitle>Deployment domain</CardTitle>
              <CardDescription>
                Your custom domain for deployed apps (if configured).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current domain</span>
                <span className="font-mono">
                  {deployDomain === undefined ? "Loading..." : deployDomain || "Not configured (using *.vercel.app)"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Each app you deploy gets a unique subdomain on this domain (e.g., <code className="rounded bg-muted px-1.5 py-0.5">my-app-abc123.breezify.dev</code>).
                The domain is verified and managed in your Vercel account settings.
              </p>
            </CardContent>
          </Card>
        </Section>
      </Group>

      <Group label="Data & danger zone">
        <Section title="Your data" keywords="export download privacy gdpr" query={search}>
        <Card>
          <CardHeader>
            <CardTitle>Your data</CardTitle>
            <CardDescription>
              Download everything Breezify has stored about your account as a single file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {exportError && (
              <div className="mb-4 flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{exportError}</span>
              </div>
            )}
            <Button variant="secondary" onClick={handleExport} loading={exportLoading}>
              <Download className="h-4 w-4" />
              Download my data
            </Button>
          </CardContent>
        </Card>
        </Section>

        <Section title="Vercel projects" keywords="vercel undeploy delete deploy project quota bulk" query={search}>
        <Card className="border-error/30">
          <CardHeader>
            <CardTitle className="text-error">Vercel projects</CardTitle>
            <CardDescription>
              Undeploy every app that&apos;s its own real Vercel project in one go, without deleting the apps
              themselves — free-tier apps aren&apos;t affected. Each app stays put and can be redeployed any time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {deleteVercelError && (
              <div className="mb-4 flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{deleteVercelError}</span>
              </div>
            )}
            {deleteVercelResult !== null && (
              <div className="mb-4 flex items-start gap-2 rounded border border-success/30 bg-success/5 p-3 text-sm text-success">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Undeployed {deleteVercelResult} app{deleteVercelResult === 1 ? "" : "s"} — their Vercel project
                  {deleteVercelResult === 1 ? " was" : "s were"} deleted. Redeploy any of them any time.
                </span>
              </div>
            )}
            <Button
              variant="destructive"
              onClick={() => setShowDeleteVercelConfirm(true)}
              loading={deleteVercelLoading}
            >
              Undeploy all projects
            </Button>
          </CardContent>
        </Card>
        </Section>

        <Section title="Danger zone" keywords="delete account remove close cancel" query={search}>
        <Card className="border-error/30">
          <CardHeader>
            <CardTitle className="text-error">Danger zone</CardTitle>
            <CardDescription>Permanently delete your account, all apps, and all Vercel projects.</CardDescription>
          </CardHeader>
          <CardContent>
            {deleteError && (
              <div className="mb-4 flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{deleteError}</span>
              </div>
            )}
            <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)} loading={deleteLoading}>
              Delete account
            </Button>
          </CardContent>
        </Card>
        </Section>
      </Group>

      {showDeleteVercelConfirm && (
        <ConfirmDialog
          title="Undeploy all projects?"
          description="Every deployed app that's its own real Vercel project goes offline and that project is deleted on Vercel. Free-tier apps aren't affected. Your apps, their code, and history stay put — redeploy any of them any time. This cannot be undone."
          confirmLabel="Yes, undeploy all projects"
          loading={deleteVercelLoading}
          error={deleteVercelError}
          onClose={() => {
            if (!deleteVercelLoading) setShowDeleteVercelConfirm(false);
          }}
          onConfirm={handleDeleteAllVercelProjects}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmDialog
          title="Delete your account permanently?"
          description="All your Breezify apps, deployed Vercel projects, custom domains, billing history, and credits will be permanently deleted. This cannot be undone."
          confirmLabel="Yes, delete everything"
          loading={deleteLoading}
          error={deleteError}
          onClose={() => {
            if (!deleteLoading) setShowDeleteConfirm(false);
          }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <SettingsContent />
      </AppShell>
    </ProtectedRoute>
  );
}
