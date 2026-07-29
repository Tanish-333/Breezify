"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import { friendlyAuthError } from "@/lib/auth-errors";
import { formatCredits } from "@/lib/utils";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";

const PROVIDER_LABELS: Record<string, string> = {
  "password": "Email & password",
  "google.com": "Google",
  "github.com": "GitHub",
  "apple.com": "Apple",
};

function SettingsContent() {
  const router = useRouter();
  const { user, profile, changePassword, deleteAccount, signOut } = useAuth();
  const [newPassword, setNewPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

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
      setPwError(friendlyAuthError(err));
    } finally {
      setPwLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete your account permanently? This cannot be undone.")) return;
    setDeleteError("");
    setDeleteLoading(true);
    try {
      await deleteAccount();
      router.push("/");
    } catch (err) {
      setDeleteError(friendlyAuthError(err));
    } finally {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your account and preferences.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Name</span>
            <span>{user?.displayName || "—"}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Email verified</span>
            {user?.emailVerified ? (
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
            <span>{profile ? formatCredits(profile.credits) : "—"}</span>
          </div>
        </CardContent>
      </Card>

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

      {hasPassword && (
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
          </CardContent>
        </Card>
      )}

      <Card className="border-error/30">
        <CardHeader>
          <CardTitle className="text-error">Danger zone</CardTitle>
          <CardDescription>Permanently delete your account and all your apps.</CardDescription>
        </CardHeader>
        <CardContent>
          {deleteError && (
            <div className="mb-4 flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{deleteError}</span>
            </div>
          )}
          <Button variant="destructive" onClick={handleDelete} loading={deleteLoading}>
            Delete account
          </Button>
        </CardContent>
      </Card>
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
