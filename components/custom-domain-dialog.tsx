"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AlertCircle, CheckCircle2, Globe, RefreshCw, Trash2, X } from "lucide-react";

interface DomainVerificationRecord {
  type: string;
  domain: string;
  value: string;
  reason: string;
}

interface DomainStatus {
  name: string;
  verified: boolean;
  verification?: DomainVerificationRecord[];
}

async function authedFetch(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      ...(init.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export function CustomDomainDialog({
  appId,
  currentDomain,
  onClose,
}: {
  appId: string;
  currentDomain?: string;
  onClose: () => void;
}) {
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  // The dialog only stores a verified boolean in Firestore, not the DNS
  // records Vercel wants — fetch those live so a still-pending domain shows
  // real instructions instead of nothing.
  useEffect(() => {
    if (!currentDomain) return;
    setChecking(true);
    authedFetch(`/api/domains?appId=${encodeURIComponent(appId)}`)
      .then((data) => setStatus(data))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't check that domain's status."))
      .finally(() => setChecking(false));
  }, [appId, currentDomain]);

  async function add() {
    setError("");
    const trimmed = domain.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter a domain, e.g. myapp.com.");
      return;
    }
    setLoading(true);
    try {
      const data = await authedFetch("/api/domains", {
        method: "POST",
        body: JSON.stringify({ appId, domain: trimmed }),
      });
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that domain.");
    } finally {
      setLoading(false);
    }
  }

  async function recheck() {
    setError("");
    setChecking(true);
    try {
      const data = await authedFetch(`/api/domains?appId=${encodeURIComponent(appId)}`);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't check that domain's status.");
    } finally {
      setChecking(false);
    }
  }

  async function remove() {
    setError("");
    setRemoving(true);
    try {
      await authedFetch("/api/domains", {
        method: "DELETE",
        body: JSON.stringify({ appId }),
      });
      setStatus(null);
      setDomain("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that domain.");
    } finally {
      setRemoving(false);
    }
  }

  const activeDomain = status?.name ?? currentDomain;

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
            <h2 className="flex items-center gap-2 font-semibold">
              <Globe className="h-4 w-4" />
              Custom domain
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Point a domain you own at this deployed app.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!activeDomain ? (
            <>
              <div>
                <Label htmlFor="custom-domain">Domain</Label>
                <Input
                  id="custom-domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="myapp.com"
                  className="font-mono"
                />
              </div>
              <Button className="w-full" onClick={add} loading={loading}>
                Add domain
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <span className="truncate font-mono text-sm">{activeDomain}</span>
                {checking ? (
                  <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                ) : status?.verified ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Verified
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">Pending</span>
                )}
              </div>

              {!status?.verified && status?.verification && status.verification.length > 0 && (
                <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                  <p className="text-muted-foreground">
                    Add this DNS record at your domain registrar, then check status:
                  </p>
                  {status.verification.map((rec, i) => (
                    <div key={i} className="space-y-0.5 font-mono">
                      <div>Type: {rec.type}</div>
                      <div className="truncate">Name: {rec.domain}</div>
                      <div className="truncate">Value: {rec.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {!status?.verified && (
                <Button variant="secondary" className="w-full" onClick={recheck} loading={checking}>
                  <RefreshCw className="h-4 w-4" />
                  Check status
                </Button>
              )}

              <Button
                variant="ghost"
                className="w-full text-error hover:bg-error/10 hover:text-error"
                onClick={remove}
                loading={removing}
              >
                <Trash2 className="h-4 w-4" />
                Remove domain
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
