"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { AlertCircle, LogOut, Trash2, UserPlus, Users, X } from "lucide-react";

interface Collaborator {
  uid: string;
  email: string;
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

export function CollaboratorsDialog({
  appId,
  isOwner,
  onClose,
}: {
  appId: string;
  isOwner: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await authedFetch(`/api/apps/${appId}/collaborators`);
      setCollaborators(data.collaborators);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load collaborators.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function invite() {
    setError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter an email address.");
      return;
    }
    setInviting(true);
    try {
      await authedFetch(`/api/apps/${appId}/collaborators`, {
        method: "POST",
        body: JSON.stringify({ email: trimmed }),
      });
      setEmail("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add that collaborator.");
    } finally {
      setInviting(false);
    }
  }

  async function remove(uid: string) {
    setError("");
    setRemoving(uid);
    try {
      await authedFetch(`/api/apps/${appId}/collaborators`, {
        method: "DELETE",
        body: JSON.stringify({ uid }),
      });
      if (uid === user?.uid) {
        onClose(); // Left the app — nothing left here to show.
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove that collaborator.");
    } finally {
      setRemoving(null);
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
            <h2 className="flex items-center gap-2 font-semibold">
              <Users className="h-4 w-4" />
              Collaborators
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isOwner
                ? "Invite an existing Breezify user to work on this app. They use their own credits and plan, not yours."
                : "Everyone who can work on this app."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : collaborators.length === 0 ? (
            <p className="text-sm text-muted-foreground">No collaborators yet.</p>
          ) : (
            collaborators.map((c) => (
              <div
                key={c.uid}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{c.email}</span>
                {(isOwner || c.uid === user?.uid) && (
                  <button
                    onClick={() => remove(c.uid)}
                    disabled={removing === c.uid}
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-error/10 hover:text-error disabled:opacity-50"
                    title={c.uid === user?.uid ? "Leave" : "Remove"}
                  >
                    {c.uid === user?.uid ? (
                      <LogOut className="h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isOwner && (
          <div className="mt-5 space-y-3 border-t border-border pt-5">
            <div>
              <Label htmlFor="collab-email">Invite by email</Label>
              <Input
                id="collab-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && invite()}
                placeholder="teammate@example.com"
              />
            </div>
            <Button className="w-full" onClick={invite} loading={inviting}>
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
