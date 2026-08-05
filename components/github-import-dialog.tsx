"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { friendlyAuthError } from "@/lib/auth-errors";
import { getGithubToken, hasGithubToken, clearGithubToken } from "@/lib/github-connect";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { GithubIcon } from "@/components/oauth-icons";
import { AlertCircle, ArrowRight, ChevronDown, Lock, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Repo {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  description: string | null;
  pushedAt: string | null;
}

async function authedFetch(path: string, idToken: string, body: unknown, signal?: AbortSignal) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.error || "Request failed.") as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return data;
}

export function GithubImportDialog({ onClose }: { onClose: () => void }) {
  const { connectGithub } = useAuth();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [reposLoading, setReposLoading] = useState(false);
  const [repoQuery, setRepoQuery] = useState("");
  const [repoMenuOpen, setRepoMenuOpen] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const repoFieldRef = useRef<HTMLDivElement>(null);

  const [branches, setBranches] = useState<string[] | null>(null);
  const [branchesLoading, setBranchesLoading] = useState(false);
  const [branchQuery, setBranchQuery] = useState("");
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const branchFieldRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ appId: string; fileCount: number; skipped: number } | null>(null);

  // Closing the dialog (or starting a newer request of the same kind)
  // aborts whatever's still in flight, instead of leaving it to keep
  // running and land on an unmounted component.
  const abortRef = useRef<AbortController | null>(null);
  function startRequest() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller.signal;
  }
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    setConnected(hasGithubToken());
  }, []);

  // Close either dropdown on an outside click.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!repoFieldRef.current?.contains(e.target as Node)) setRepoMenuOpen(false);
      if (!branchFieldRef.current?.contains(e.target as Node)) setBranchMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  async function loadRepos() {
    const signal = startRequest();
    setReposLoading(true);
    setError("");
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in.");
      const idToken = await user.getIdToken();
      const data = await authedFetch("/api/github/repos", idToken, { githubToken: getGithubToken() }, signal);
      if (signal.aborted) return;
      setRepos(data.repos);
    } catch (err) {
      if (signal.aborted) return;
      if ((err as { status?: number }).status === 400 && /token/i.test((err as Error).message)) {
        clearGithubToken();
        setConnected(false);
      }
      setError(err instanceof Error ? err.message : "Couldn't load your repositories.");
    } finally {
      if (!signal.aborted) setReposLoading(false);
    }
  }

  useEffect(() => {
    if (connected) loadRepos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  async function loadBranches(repo: Repo) {
    const signal = startRequest();
    setBranchesLoading(true);
    setBranches(null);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in.");
      const idToken = await user.getIdToken();
      const data = await authedFetch(
        "/api/github/branches",
        idToken,
        { owner: repo.owner, repo: repo.name, githubToken: getGithubToken() },
        signal
      );
      if (signal.aborted) return;
      setBranches(data.branches);
    } catch (err) {
      if (signal.aborted) return;
      if ((err as { status?: number }).status === 400 && /token/i.test((err as Error).message)) {
        clearGithubToken();
        setConnected(false);
      }
      setError(err instanceof Error ? err.message : "Couldn't load that repository's branches.");
    } finally {
      if (!signal.aborted) setBranchesLoading(false);
    }
  }

  function selectRepo(repo: Repo) {
    setSelectedRepo(repo);
    setRepoQuery("");
    setRepoMenuOpen(false);
    setSelectedBranch(null);
    setBranchQuery("");
    loadBranches(repo);
  }

  function clearRepo() {
    setSelectedRepo(null);
    setBranches(null);
    setSelectedBranch(null);
  }

  const filteredRepos = useMemo(() => {
    if (!repos) return [];
    const q = repoQuery.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) => r.fullName.toLowerCase().includes(q));
  }, [repos, repoQuery]);

  const filteredBranches = useMemo(() => {
    if (!branches) return [];
    const q = branchQuery.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter((b) => b.toLowerCase().includes(q));
  }, [branches, branchQuery]);

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
    if (!selectedRepo) return;
    const signal = startRequest();
    setError("");
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("You must be signed in.");
      const idToken = await user.getIdToken();
      const data = await authedFetch(
        "/api/github/import",
        idToken,
        { owner: selectedRepo.owner, repo: selectedRepo.name, branch: selectedBranch || undefined, githubToken: getGithubToken() },
        signal
      );
      if (signal.aborted) return;
      setResult(data);
    } catch (err) {
      if (signal.aborted) return;
      if ((err as { status?: number }).status === 400 && /token/i.test((err as Error).message)) {
        clearGithubToken();
        setConnected(false);
      }
      setError(err instanceof Error ? err.message : "Import failed.");
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
              <Label htmlFor="repo-search">Repository</Label>
              <div className="relative" ref={repoFieldRef}>
                {selectedRepo ? (
                  <div className="flex h-10 w-full items-center justify-between rounded border border-border bg-background px-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      {selectedRepo.private && (
                        <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{selectedRepo.fullName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={clearRepo}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="repo-search"
                      value={repoQuery}
                      onChange={(e) => setRepoQuery(e.target.value)}
                      onFocus={() => setRepoMenuOpen(true)}
                      placeholder={reposLoading ? "Loading your repositories..." : "Search your repositories..."}
                      disabled={reposLoading}
                      className="flex h-10 w-full rounded border border-border bg-background pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground disabled:opacity-60"
                    />
                  </div>
                )}

                {repoMenuOpen && !selectedRepo && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-xl">
                    {reposLoading ? (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">Loading...</p>
                    ) : filteredRepos.length === 0 ? (
                      <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                        {repos === null ? "Couldn't load repositories." : "No repositories match."}
                      </p>
                    ) : (
                      filteredRepos.map((r) => (
                        <button
                          key={r.fullName}
                          type="button"
                          onClick={() => selectRepo(r)}
                          className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-muted"
                        >
                          {r.private ? (
                            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <GithubIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{r.fullName}</span>
                            {r.description && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {r.description}
                              </span>
                            )}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {selectedRepo && (
              <div>
                <Label htmlFor="branch-search">Branch</Label>
                <div className="relative" ref={branchFieldRef}>
                  <button
                    type="button"
                    id="branch-search"
                    onClick={() => setBranchMenuOpen((o) => !o)}
                    disabled={branchesLoading}
                    className="flex h-10 w-full items-center justify-between rounded border border-border bg-background px-3 text-left text-sm transition-colors hover:border-muted-foreground disabled:opacity-60"
                  >
                    <span className="truncate">
                      {branchesLoading
                        ? "Loading branches..."
                        : selectedBranch || `${selectedRepo.defaultBranch} (default)`}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>

                  {branchMenuOpen && !branchesLoading && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-background p-1 shadow-xl">
                      <div className="relative p-1">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input
                          autoFocus
                          value={branchQuery}
                          onChange={(e) => setBranchQuery(e.target.value)}
                          placeholder="Search branches..."
                          className="h-8 w-full rounded border border-border bg-background pl-7 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
                        />
                      </div>
                      {filteredBranches.length === 0 ? (
                        <p className="px-3 py-4 text-center text-xs text-muted-foreground">No branches match.</p>
                      ) : (
                        filteredBranches.map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => {
                              setSelectedBranch(b === selectedRepo.defaultBranch ? null : b);
                              setBranchQuery("");
                              setBranchMenuOpen(false);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                              (selectedBranch ?? selectedRepo.defaultBranch) === b && "bg-muted/60 font-medium"
                            )}
                          >
                            <span className="truncate">{b}</span>
                            {b === selectedRepo.defaultBranch && (
                              <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                                Default
                              </span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

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

            <Button className="w-full" onClick={importRepo} loading={loading} disabled={!selectedRepo}>
              <GithubIcon className="h-4 w-4" />
              Import repository
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
