"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getGithubToken, hasGithubToken, clearGithubToken } from "@/lib/github-connect";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { GithubIcon } from "@/components/oauth-icons";
import { AlertCircle, ArrowRight, X } from "lucide-react";

/** Accepts "owner/repo" or a full github.com URL. */
function parseRepo(input: string): { owner: string; repo: string } | null {
  const trimmed = input.trim().replace(/\.git$/, "");
  const urlMatch = trimmed.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (urlMatch) return { owner: urlMatch[1], repo: urlMatch[2] };
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length !== 2) return null;
  return { owner: parts[0], repo: parts[1] };
}

export function GithubImportDialog({ onClose }: { onClose: () => void }) {
  const { connectGithub } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [repoInput, setRepoInput] = useState("");
  const [branch, setBranch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ appId: string; fileCount: number; skipped: number } | null>(null);

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

  async function importRepo() {
    setError("");
    const parsed = parseRepo(repoInput);
    if (!parsed) {
      setError('Enter a repository as "owner/repo" or a github.com URL.');
      return;
    }
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/github/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          owner: parsed.owner,
          repo: parsed.repo,
          branch: branch.trim() || undefined,
          githubToken: getGithubToken(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400 && /token/i.test(data.error || "")) clearGithubToken();
        throw new Error(data.error || "Import failed.");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
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
            <h2 className="font-semibold">Import from GitHub</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pull an existing repo&apos;s files in as a new app, then keep building on it with AI.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {result ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
              <span>
                Imported {result.fileCount} files
                {result.skipped ? ` (${result.skipped} skipped: binary or too large)` : ""}.
              </span>
            </div>
            <a href={`/build/${result.appId}`}>
              <Button className="w-full">
                Open app
                <ArrowRight className="h-4 w-4" />
              </Button>
            </a>
          </div>
        ) : !connected ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your GitHub account to read the repository, no token to copy or paste.
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
            <div>
              <Label htmlFor="repo-input">Repository</Label>
              <Input
                id="repo-input"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="owner/repo or https://github.com/owner/repo"
              />
            </div>

            <div>
              <Label htmlFor="branch-input">Branch (optional)</Label>
              <Input
                id="branch-input"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="Defaults to the repo's default branch"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Only text/source files under 150 KB each are imported (up to 250 files, 600 KB total).
              Backend code, secrets, and binary assets are skipped, same limits generated apps run under.
            </p>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button className="w-full" onClick={importRepo} loading={loading} disabled={!repoInput.trim()}>
              <GithubIcon className="h-4 w-4" />
              Import repository
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
