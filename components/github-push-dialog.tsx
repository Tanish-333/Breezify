"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, ExternalLink, X } from "lucide-react";

export function GithubPushDialog({
  appId,
  defaultName,
  onClose,
  onPushed,
}: {
  appId: string;
  defaultName: string;
  onClose: () => void;
  onPushed: (url: string) => void;
}) {
  const [token, setToken] = useState("");
  const [name, setName] = useState(
    defaultName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
      "feather-app"
  );
  const [isPrivate, setIsPrivate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");

  async function push() {
    setError("");
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in.");
      const idToken = await user.getIdToken();
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ appId, githubToken: token, repoName: name, isPrivate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Push failed.");
      setUrl(data.url);
      onPushed(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Push failed.");
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
            <h2 className="font-semibold">Push to GitHub</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Creates a new repository and commits every generated file.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {url ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm text-success">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Pushed successfully.</span>
            </div>
            <a href={url} target="_blank" rel="noreferrer">
              <Button className="w-full">
                Open repository
                <ExternalLink className="h-4 w-4" />
              </Button>
            </a>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="repo">Repository name</Label>
              <Input
                id="repo"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-app"
              />
            </div>

            <div>
              <Label htmlFor="token">GitHub personal access token</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
              />
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                Needs the <code className="text-foreground">repo</code> scope. Used once for
                this push and never stored.{" "}
                <a
                  href="https://github.com/settings/tokens/new?scopes=repo&description=Feather%20123"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground underline"
                >
                  Create one
                </a>
              </p>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="h-3.5 w-3.5 accent-current"
              />
              Make the repository private
            </label>

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={push}
              loading={loading}
              disabled={!token.trim() || !name.trim()}
            >
              Create repository and push
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
