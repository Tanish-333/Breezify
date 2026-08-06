"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn, formatDate } from "@/lib/utils";
import { ModalPortal } from "@/components/modal-portal";
import { AlertCircle, CheckCircle2, Globe, RefreshCw, Search, Trash2, X } from "lucide-react";

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

interface DomainSearchResult {
  domain: string;
  available: boolean;
  price?: number;
  years?: number;
}

interface DomainContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

const EMPTY_CONTACT: DomainContact = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  address1: "",
  city: "",
  state: "",
  zip: "",
  country: "US",
};

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
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Something went wrong (${res.status}). Please try again in a moment.`);
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

export function CustomDomainDialog({
  appId,
  currentDomain,
  domainPurchased,
  domainExpiresAt,
  domainAutoRenew,
  onClose,
}: {
  appId: string;
  currentDomain?: string;
  /** True only for the domain actually bought through Breezify (see app/api/stripe/webhook) — cleared as soon as `currentDomain` changes to anything else. */
  domainPurchased?: boolean;
  domainExpiresAt?: number;
  domainAutoRenew?: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"attach" | "buy">("attach");
  const [error, setError] = useState("");

  // Attach-an-existing-domain flow
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<DomainStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Buy-a-new-domain flow
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<DomainSearchResult | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contact, setContact] = useState<DomainContact>(EMPTY_CONTACT);
  const [buyAutoRenew, setBuyAutoRenew] = useState(true);
  const [buying, setBuying] = useState(false);

  // Already-purchased domain: auto-renew toggle
  const [renewToggleLoading, setRenewToggleLoading] = useState(false);
  const [renewToggleError, setRenewToggleError] = useState("");

  async function toggleAutoRenew(next: boolean) {
    setRenewToggleError("");
    setRenewToggleLoading(true);
    try {
      await authedFetch("/api/domains/auto-renew", {
        method: "POST",
        body: JSON.stringify({ appId, autoRenew: next }),
      });
      // No local state to flip here — domainAutoRenew comes from the parent
      // via the app's own live Firestore listener, which picks this up on
      // its own.
    } catch (err) {
      setRenewToggleError(err instanceof Error ? err.message : "Couldn't update auto-renew.");
    } finally {
      setRenewToggleLoading(false);
    }
  }

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

  async function search() {
    setError("");
    setResult(null);
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      setError("Enter a domain, e.g. myapp.com.");
      return;
    }
    setSearching(true);
    try {
      const data = await authedFetch(`/api/domains/search?domain=${encodeURIComponent(trimmed)}`);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't search that domain.");
    } finally {
      setSearching(false);
    }
  }

  async function buy() {
    setError("");
    if (!result?.available) return;
    for (const [key, value] of Object.entries(contact)) {
      if (!value.trim()) {
        setError(`Fill in every field (missing ${key}).`);
        return;
      }
    }
    if (!/^[A-Za-z]{2}$/.test(contact.country)) {
      setError("Country must be a 2-letter code, e.g. US.");
      return;
    }
    setBuying(true);
    try {
      const data = await authedFetch("/api/domains/purchase", {
        method: "POST",
        body: JSON.stringify({ appId, domain: result.domain, contact, autoRenew: buyAutoRenew }),
      });
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start checkout.");
      setBuying(false);
    }
  }

  const activeDomain = status?.name ?? currentDomain;

  return (
    <ModalPortal>
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
              {activeDomain ? "Manage this app's custom domain." : "Point a domain at this deployed app."}
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
              <div className="flex gap-1 rounded-lg border border-border p-0.5">
                <button
                  onClick={() => {
                    setMode("attach");
                    setError("");
                  }}
                  className={cn(
                    "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    mode === "attach"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  I own one already
                </button>
                <button
                  onClick={() => {
                    setMode("buy");
                    setError("");
                  }}
                  className={cn(
                    "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    mode === "buy" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Buy a new one
                </button>
              </div>

              {mode === "attach" ? (
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
              ) : !showContactForm ? (
                <>
                  <div className="flex gap-2">
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && search()}
                      placeholder="myapp.com"
                      className="font-mono"
                    />
                    <Button onClick={search} loading={searching} size="md" className="shrink-0">
                      <Search className="h-4 w-4" />
                    </Button>
                  </div>

                  {result &&
                    (result.available ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                          <span className="truncate font-mono text-sm">{result.domain}</span>
                          <span className="shrink-0 text-sm font-medium text-success">
                            ${result.price?.toFixed(2)}/yr
                          </span>
                        </div>
                        <Button className="w-full" onClick={() => setShowContactForm(true)}>
                          Buy for ${result.price?.toFixed(2)}
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{result.domain} isn&apos;t available.</p>
                    ))}
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Registrant contact for <span className="font-mono">{result?.domain}</span> — required to
                    register a domain, not shown to visitors of your app.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="dc-first">First name</Label>
                      <Input
                        id="dc-first"
                        value={contact.firstName}
                        onChange={(e) => setContact((c) => ({ ...c, firstName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="dc-last">Last name</Label>
                      <Input
                        id="dc-last"
                        value={contact.lastName}
                        onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="dc-email">Email</Label>
                    <Input
                      id="dc-email"
                      type="email"
                      value={contact.email}
                      onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dc-phone">Phone</Label>
                    <Input
                      id="dc-phone"
                      placeholder="+14155551234"
                      value={contact.phone}
                      onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="dc-address">Address</Label>
                    <Input
                      id="dc-address"
                      value={contact.address1}
                      onChange={(e) => setContact((c) => ({ ...c, address1: e.target.value }))}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label htmlFor="dc-city">City</Label>
                      <Input
                        id="dc-city"
                        value={contact.city}
                        onChange={(e) => setContact((c) => ({ ...c, city: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="dc-state">State</Label>
                      <Input
                        id="dc-state"
                        value={contact.state}
                        onChange={(e) => setContact((c) => ({ ...c, state: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="dc-zip">ZIP</Label>
                      <Input
                        id="dc-zip"
                        value={contact.zip}
                        onChange={(e) => setContact((c) => ({ ...c, zip: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="dc-country">Country (2-letter code)</Label>
                    <Input
                      id="dc-country"
                      placeholder="US"
                      maxLength={2}
                      value={contact.country}
                      onChange={(e) => setContact((c) => ({ ...c, country: e.target.value.toUpperCase() }))}
                    />
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={buyAutoRenew}
                      onChange={(e) => setBuyAutoRenew(e.target.checked)}
                      className="h-3.5 w-3.5 accent-current"
                    />
                    Automatically renew this domain each year
                  </label>

                  <Button className="w-full" onClick={buy} loading={buying}>
                    Pay ${result?.price?.toFixed(2)} &amp; register
                  </Button>
                  <button
                    onClick={() => setShowContactForm(false)}
                    className="text-xs text-muted-foreground underline hover:text-foreground"
                  >
                    Back
                  </button>
                </div>
              )}
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

              {domainPurchased && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Purchased through Breezify
                    {domainExpiresAt ? ` · registered until ${formatDate(domainExpiresAt)}` : ""}.
                  </p>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(domainAutoRenew)}
                      disabled={renewToggleLoading}
                      onChange={(e) => toggleAutoRenew(e.target.checked)}
                      className="h-3.5 w-3.5 accent-current"
                    />
                    Automatically renew this domain each year
                    {renewToggleLoading && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </label>
                  {renewToggleError && <p className="text-xs text-error">{renewToggleError}</p>}
                </div>
              )}

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
    </ModalPortal>
  );
}
