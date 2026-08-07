"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { transferOwnership } from "@/lib/use-apps";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ModalPortal } from "@/components/modal-portal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { COLLABORATOR_ROLES, type CollaboratorRole } from "@/lib/types";
import { AlertCircle, ArrowLeftRight, Crown, Eye, LogOut, Pencil, Trash2, UserPlus, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Collaborator {
  uid: string;
  email: string;
  role: CollaboratorRole;
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
  // A non-JSON body (an HTML error/404 page from the platform, a timeout, a
  // truncated response) makes res.json() throw its own cryptic "Unexpected
  // token '<'..." SyntaxError — surface the real HTTP status instead of
  // that.
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Something went wrong (${res.status}). Please try again in a moment.`);
  }
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

const ROLE_LABEL: Record<CollaboratorRole, string> = { editor: "Editor", viewer: "Viewer" };
const ROLE_HINT: Record<CollaboratorRole, string> = {
  editor: "Can refine, deploy, and push this app like the owner",
  viewer: "Can see the app, its code, and history — read-only",
};

function RoleBadge({ role }: { role: CollaboratorRole }) {
  return (
    <Badge className="gap-1">
      {role === "editor" ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      {ROLE_LABEL[role]}
    </Badge>
  );
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
  const [ownerUid, setOwnerUid] = useState<string | null>(null);
  const [ownerEmail, setOwnerEmail] = useState<string | undefined>();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CollaboratorRole>("editor");
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [transferTarget, setTransferTarget] = useState<Collaborator | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await authedFetch(`/api/apps/${appId}/collaborators`);
      setOwnerUid(data.ownerUid);
      setOwnerEmail(data.ownerEmail);
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
        body: JSON.stringify({ email: trimmed, role: inviteRole }),
      });
      setEmail("");
      setInviteRole("editor");
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

  async function changeRole(uid: string, role: CollaboratorRole) {
    setError("");
    setChangingRole(uid);
    try {
      await authedFetch(`/api/apps/${appId}/collaborators`, {
        method: "PATCH",
        body: JSON.stringify({ uid, role }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change that collaborator's role.");
    } finally {
      setChangingRole(null);
    }
  }

  async function confirmTransfer() {
    if (!transferTarget || !user?.uid || !user.email) return;
    setTransferring(true);
    setError("");
    try {
      await transferOwnership(appId, user.uid, user.email, transferTarget.uid);
      setTransferTarget(null);
      onClose(); // isOwner is now stale for this session's view of the dialog — cleanest to just close.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't transfer ownership.");
    } finally {
      setTransferring(false);
    }
  }

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
              <Users className="h-4 w-4" />
              Collaborators
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {isOwner
                ? "Invite an existing Breezify user to work on this app. They use their own credits and plan, not yours."
                : "Everyone who can see or work on this app."}
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
          ) : (
            <>
              {ownerUid && (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {ownerEmail ?? (ownerUid === user?.uid ? user?.email : "Owner")}
                    {ownerUid === user?.uid && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  <Badge className="gap-1">
                    <Crown className="h-3 w-3" />
                    Owner
                  </Badge>
                </div>
              )}

              {collaborators.length === 0 ? (
                isOwner && (
                  <p className="px-1 py-1 text-xs text-muted-foreground">
                    No collaborators yet — invite one below.
                  </p>
                )
              ) : (
                collaborators.map((c) => (
                  <div
                    key={c.uid}
                    className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {c.email}
                      {c.uid === user?.uid && <span className="text-muted-foreground"> (you)</span>}
                    </span>

                    {isOwner ? (
                      <select
                        value={c.role}
                        disabled={changingRole === c.uid}
                        onChange={(e) => changeRole(c.uid, e.target.value as CollaboratorRole)}
                        title={ROLE_HINT[c.role]}
                        className="rounded-md border border-border bg-background px-1.5 py-1 text-xs disabled:opacity-50"
                      >
                        {COLLABORATOR_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <RoleBadge role={c.role} />
                    )}

                    {isOwner && (
                      <button
                        onClick={() => setTransferTarget(c)}
                        className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        title={`Make ${c.email} the owner`}
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                      </button>
                    )}

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
            </>
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
            <div className="flex gap-1 rounded-lg border border-border p-0.5">
              {COLLABORATOR_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setInviteRole(r)}
                  title={ROLE_HINT[r]}
                  className={cn(
                    "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                    inviteRole === r
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
            <Button className="w-full" onClick={invite} loading={inviting}>
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          </div>
        )}
      </div>
    </div>

    {transferTarget && (
      <ConfirmDialog
        title={`Make ${transferTarget.email} the owner?`}
        description="They'll get full control of this app — billing-gated actions, deleting it, inviting or removing collaborators, all of it. You'll become an editor instead, so you keep your access, just not ownership."
        confirmLabel="Transfer ownership"
        loading={transferring}
        error={error}
        onClose={() => !transferring && setTransferTarget(null)}
        onConfirm={confirmTransfer}
      />
    )}
    </ModalPortal>
  );
}
