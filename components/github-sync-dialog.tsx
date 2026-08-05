"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getGithubToken, hasGithubToken, clearGithubToken } from "@/lib/github-connect";
import { Button } from "@/components/ui/button";
import { GithubIcon } from "@/components/oauth-icons";
import { AlertCircle, CheckCircle2, RefreshCw, X } from "lucide-react";

export function GithubSyncDialog({
  appId,
  repoUrl,
  onClose,
  onSynced,
}: {
  appId: string;
  repoUrl: string;
  onClose: () => void;
  onSynced: () => void;
}) {
  const { connectGithub } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ fileCount: number; skipped: number } | null>(null);

  // Closing the dialog mid-sync previously left the fetch running in the
  // background instead of actually stopping it.
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    setConnected(hasGithubToken());
  }, []);

  async function connect() {
    setError("");
    setConnecting(true);
    try {
      await connectGithub();
      setConnected(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setConnecting(false);
    }
  }

  async function sync() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    setError("");
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/github/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ appId, githubToken: getGithubToken() }),
        signal,
      });
      const data = await res.json();
      if (signal.aborted) return;
      if (!res.ok) {
        if (res.status === 400 && /token/i.test(data.error || "")) clearGithubToken();
        throw new Error(data.error || "Sync failed.");
      }
      setDone({ fileCount: data.fileCount, skipped: data.skipped ?? 0 });
      onSynced();
    } catch (err) {
      if (signal.aborted) return;
      setError(err instanceof Error ? err.message : "Sync failed.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-2xl animate-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Sync from GitHub</h2>
            <p className="mt-1 truncate text-xs text-muted-foreground" title={repoUrl}>
              Pulls the latest commit from {repoUrl.replace("https://github.com/", "")} and
              overwrites this app&apos;s files.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Pulled {done.fileCount} files
                {done.skipped ? ` (${done.skipped} skipped)` : ""}.
              </span>
            </div>
            <Button className="w-full" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : !connected ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your GitHub account to pull the latest commit.
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button className="w-full" onClick={connect} loading={connecting}>
              <GithubIcon className="h-4 w-4" />
              Connect GitHub
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              This replaces the app&apos;s current files with whatever is on the repo&apos;s
              default branch right now. Earlier versions stay in this app&apos;s history.
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button className="w-full" onClick={sync} loading={loading}>
              <RefreshCw className="h-4 w-4" />
              Pull latest commit
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
