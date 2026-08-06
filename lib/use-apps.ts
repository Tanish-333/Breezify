"use client";

import { useEffect, useState } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  limitToLast,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logClientError } from "@/lib/client-error-log";
import type { AppSecret, AppTurn, CollaboratorRole, DailyAnalytics, FeatherApp } from "@/lib/types";

/**
 * A Firestore listener error (a missing composite index, a rules rejection,
 * an expired token) previously just cleared the list and stopped loading —
 * indistinguishable from "you genuinely have no apps." Logging it is what
 * makes that class of bug show up as a real, findable error instead of a
 * silent empty state.
 */
function logListenerError(context: string, err: unknown) {
  console.error(`[${context}]`, err);
  logClientError(err instanceof Error ? err : new Error(String(err)), { context });
}

/**
 * Firestore timestamps come back as Timestamp objects from the client SDK,
 * but documents written over the REST API can also carry ISO strings, so
 * handle both rather than silently falling back to "now".
 */
function toMillis(value: unknown): number | undefined {
  if (!value) return undefined;
  if (typeof value === "object" && "toMillis" in (value as object)) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function toApp(id: string, data: any): FeatherApp {
  return {
    id,
    userId: data.userId,
    name: data.name,
    prompt: data.prompt,
    model: data.model,
    generatedCode: data.generatedCode,
    status: data.status,
    deployStatus: data.deployStatus,
    deployErrorMessage: data.deployErrorMessage,
    generatingBy: data.generatingBy,
    generatingByEmail: data.generatingByEmail,
    generatingStartedAt: toMillis(data.generatingStartedAt),
    summary: data.summary,
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    turns: Array.isArray(data.turns)
      ? data.turns.map((t: any) => ({ ...t, createdAt: toMillis(t.createdAt) ?? Date.now() }))
      : [],
    deployedUrl: data.deployedUrl,
    deployExpiresAt: toMillis(data.deployExpiresAt),
    githubUrl: data.githubUrl,
    subdomain: data.subdomain,
    customDomain: data.customDomain,
    customDomainVerified: data.customDomainVerified,
    domainPurchased: data.domainPurchased,
    domainExpiresAt: toMillis(data.domainExpiresAt),
    domainAutoRenew: data.domainAutoRenew,
    domainOrderId: data.domainOrderId,
    errorMessage: data.errorMessage,
    visits: typeof data.visits === "number" ? data.visits : undefined,
    createdAt: toMillis(data.createdAt) ?? Date.now(),
    deployedAt: toMillis(data.deployedAt),
  };
}

export function useUserApps(uid: string | undefined) {
  const [apps, setApps] = useState<FeatherApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setApps([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "apps"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setApps(snap.docs.map((d) => toApp(d.id, d.data())));
        setLoading(false);
      },
      // A broken listener (expired token, permission change, a missing
      // composite index) must not leave the last-synced list frozen on
      // screen looking current — but it also must not look identical to
      // "you have no apps," which is why this is logged.
      (err) => {
        logListenerError("useUserApps", err);
        setApps([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid]);

  return { apps, loading };
}

/**
 * Apps the current user has been invited to collaborate on, not apps they
 * own — see apps/{appId}/collaborators/{uid} in firestore.rules. A
 * collection-group query filtered on each membership doc's "uid" field
 * finds every one across all apps, then each matching app is watched
 * individually so the list stays live as membership or the app itself
 * changes.
 *
 * Requires the "collaborators" collection-group index on "uid" declared in
 * firestore.indexes.json — Firestore's automatic single-field indexes only
 * cover single-collection queries, never collection-group ones, so without
 * this index deployed to the live project (`firebase deploy --only
 * firestore:indexes`, or via the console), this query fails outright with
 * "FAILED_PRECONDITION: The query requires an index" for every user.
 */
export function useCollaboratingApps(uid: string | undefined) {
  const [apps, setApps] = useState<FeatherApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setApps([]);
      setLoading(false);
      return;
    }
    const appDocs = new Map<string, FeatherApp>();
    const appUnsubs = new Map<string, () => void>();

    function publish() {
      setApps(Array.from(appDocs.values()));
    }

    // Filtering on the "uid" field, not documentId(): a collectionGroup
    // query's documentId() equality requires a full document path, and a
    // bare uid is a 1-segment (odd) path, so `where(documentId(), "==", uid)`
    // throws "invalid document path" as soon as the query is built. See the
    // collaborators POST route, which duplicates the doc ID into this field
    // for exactly this reason.
    const q = query(collectionGroup(db, "collaborators"), where("uid", "==", uid));
    const unsubMemberships = onSnapshot(
      q,
      (snap) => {
        const currentAppIds = new Set(snap.docs.map((d) => d.ref.parent.parent!.id));

        for (const [appId, unsub] of appUnsubs) {
          if (!currentAppIds.has(appId)) {
            unsub();
            appUnsubs.delete(appId);
            appDocs.delete(appId);
          }
        }

        for (const appId of currentAppIds) {
          if (appUnsubs.has(appId)) continue;
          const unsub = onSnapshot(
            doc(db, "apps", appId),
            (appSnap) => {
              if (appSnap.exists()) {
                appDocs.set(appId, toApp(appSnap.id, appSnap.data()));
              } else {
                appDocs.delete(appId);
              }
              publish();
            },
            (err) => logListenerError("useCollaboratingApps:app", err)
          );
          appUnsubs.set(appId, unsub);
        }

        setLoading(false);
        publish();
      },
      (err) => {
        logListenerError("useCollaboratingApps", err);
        setApps([]);
        setLoading(false);
      }
    );

    return () => {
      unsubMemberships();
      for (const unsub of appUnsubs.values()) unsub();
    };
  }, [uid]);

  return { apps, loading };
}

/**
 * The signed-in user's own role on one app: "editor"/"viewer" if they're an
 * invited collaborator, null if they're the owner (irrelevant — isOwner
 * covers that separately) or have no relationship to this app at all. Used
 * to gate the build page's write actions (composer, deploy, etc.) for a
 * viewer — the same policy firestore.rules' isAppEditor and
 * lib/app-collaborators.ts's hasEditAccess already enforce server-side;
 * this is just what lets the UI hide/disable those controls instead of
 * showing them and failing on click.
 */
export function useMyCollaboratorRole(appId: string | undefined, uid: string | undefined) {
  const [role, setRole] = useState<CollaboratorRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appId || !uid) {
      setRole(null);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "apps", appId, "collaborators", uid),
      (snap) => {
        if (!snap.exists()) {
          setRole(null);
        } else {
          // Role-less doc predates this feature — same back-compat default
          // used everywhere else this is checked.
          const raw = snap.data().role;
          setRole(raw === "viewer" ? "viewer" : "editor");
        }
        setLoading(false);
      },
      (err) => {
        logListenerError("useMyCollaboratorRole", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [appId, uid]);

  return { role, loading };
}

/**
 * Hands ownership of an app to one of its current editors/viewers. The
 * outgoing owner becomes a regular "editor" collaborator instead of losing
 * access outright — a transfer is a handoff, not a removal. All three
 * writes (the app doc's userId, dropping the new owner's now-redundant
 * collaborator doc, adding the old owner's) land in one batch so nobody
 * ever observes a half-applied transfer; firestore.rules' matching
 * apps/{appId} and collaborators/{uid} rules only allow this exact
 * three-write shape from the current owner.
 */
export async function transferOwnership(
  appId: string,
  currentOwnerUid: string,
  currentOwnerEmail: string,
  newOwnerUid: string
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "apps", appId), { userId: newOwnerUid });
  batch.delete(doc(db, "apps", appId, "collaborators", newOwnerUid));
  batch.set(doc(db, "apps", appId, "collaborators", currentOwnerUid), {
    uid: currentOwnerUid,
    email: currentOwnerEmail,
    role: "editor",
    addedBy: newOwnerUid,
    addedAt: serverTimestamp(),
  });
  await batch.commit();
}

/**
 * Stars/unstars an app for the current viewer. Stored on users/{uid} rather
 * than on the app doc itself — starring is a per-viewer preference (a
 * collaborator might star an app the owner hasn't), and apps/{appId}'s
 * owner/editor-gated write rules (see firestore.rules' isAppEditor) aren't a
 * fit for a viewer-appropriate toggle like this. See firestore.rules'
 * users/{userId} update rule for the matching starredAppIds-only branch.
 */
export async function toggleStarredApp(uid: string, appId: string, currentlyStarred: boolean): Promise<void> {
  await updateDoc(doc(db, "users", uid), {
    starredAppIds: currentlyStarred ? arrayRemove(appId) : arrayUnion(appId),
  });
}

// Deleting an app used to be a plain client-side Firestore batch delete
// here, same reasoning as the removed client-side duplicateApp() below: it
// never detached a custom domain from the app's Vercel project, leaving it
// orphaned there even though Breezify itself had forgotten about it. Moved
// to deleteAppRequest() in lib/api-client.ts, which hits
// app/api/apps/[appId] (DELETE) — see lib/deploy-actions.ts' deleteApp(),
// which does the domain detach before removing the secrets/versions/
// collaborators subcollections and the app doc itself.

// Duplicating an app used to be a plain client-side Firestore write here,
// gated only by the "Duplicate" button's own Pro+ check — firestore.rules'
// apps/{appId} create rule only ever verified ownership, not plan, so that
// was a paywall in the UI only, not an enforced one. Moved to
// duplicateAppRequest() in lib/api-client.ts, which hits
// app/api/apps/duplicate and checks the plan server-side like every other
// paywalled action in this app.

/**
 * Restores the file snapshot taken right after `versionTurnId`'s turn,
 * as a new "revert" turn rather than mutating history. No AI call, free
 * for every plan. Snapshots only exist for turns generated after version
 * history shipped, so an old app's early turns may not have one.
 */
export async function revertToVersion(app: FeatherApp, versionTurnId: string): Promise<void> {
  const versionSnap = await getDoc(doc(db, "apps", app.id, "versions", versionTurnId));
  if (!versionSnap.exists()) {
    throw new Error("That version is no longer available to revert to.");
  }
  const files = (versionSnap.data().files ?? {}) as Record<string, string>;

  // Existing turns already went through toApp()'s toMillis() conversion, so
  // their createdAt is a plain number now; convert back to a real Date
  // before writing, otherwise it would be stored as a bare integer that
  // toMillis() doesn't know how to read back.
  const preservedTurns = (app.turns ?? []).map((t) => ({
    ...t,
    createdAt: new Date(t.createdAt),
  }));
  const newTurn: Omit<AppTurn, "createdAt"> & { createdAt: Date } = {
    id: crypto.randomUUID(),
    kind: "revert",
    instruction: "Reverted to an earlier version",
    summary: "Restored the files from an earlier version. Nothing was charged.",
    model: app.model,
    fileCount: Object.keys(files).length,
    createdAt: new Date(),
  };

  await Promise.all([
    updateDoc(doc(db, "apps", app.id), {
      generatedCode: { files },
      turns: [...preservedTurns, newTurn],
    }),
    setDoc(doc(db, "apps", app.id, "versions", newTurn.id), {
      // The version doc's own userId must be the actual writer's uid, not
      // the app's owner: firestore.rules' versions/{turnId} create rule
      // checks isOwner(request.resource.data.userId), i.e. that the field
      // matches request.auth.uid — deliberately not routed through a get()
      // on the parent app doc (see that rule's own comment on why). Stamping
      // app.userId here instead meant a COLLABORATOR reverting (this isn't
      // owner-gated in the UI — see the onRevert wiring in
      // app/build/[appId]/page.tsx) always failed this create with
      // permission-denied, since request.auth.uid (the collaborator) never
      // equals app.userId (the owner). The generatedCode/turns update above
      // isn't atomic with this write, so that failure didn't even undo the
      // revert — it silently applied while the whole revertToVersion() call
      // still threw and told the user it hadn't worked.
      userId: auth.currentUser?.uid ?? app.userId,
      files,
      createdAt: new Date(),
    }),
  ]);
}

/**
 * Persists a hand-edited file set as a new "edit" turn, the same shape as
 * every other change (build/refine/revert/sync) so it shows up in history
 * and can itself be reverted from later. No AI call, so it's free — see
 * the editable Monaco editor in components/code-preview.tsx this powers.
 */
export async function saveManualEdit(app: FeatherApp, files: Record<string, string>): Promise<void> {
  const preservedTurns = (app.turns ?? []).map((t) => ({
    ...t,
    createdAt: new Date(t.createdAt),
  }));
  const newTurn: Omit<AppTurn, "createdAt"> & { createdAt: Date } = {
    id: crypto.randomUUID(),
    kind: "edit",
    instruction: "Manually edited code",
    summary: "Files were edited directly in the code panel. Nothing was charged.",
    model: app.model,
    fileCount: Object.keys(files).length,
    createdAt: new Date(),
  };

  await Promise.all([
    updateDoc(doc(db, "apps", app.id), {
      generatedCode: { files },
      turns: [...preservedTurns, newTurn],
    }),
    setDoc(doc(db, "apps", app.id, "versions", newTurn.id), {
      userId: auth.currentUser?.uid ?? app.userId,
      files,
      createdAt: new Date(),
    }),
  ]);
}

function toSecret(id: string, data: any): AppSecret {
  return {
    id,
    key: data.key,
    value: data.value,
    createdAt: toMillis(data.createdAt) ?? Date.now(),
  };
}

/** Key/value pairs configured for one app, e.g. an API key the generated app calls out with. */
export function useAppSecrets(appId: string | undefined) {
  const [secrets, setSecrets] = useState<AppSecret[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appId) {
      setSecrets([]);
      setLoading(false);
      return;
    }
    const q = query(collection(db, "apps", appId, "secrets"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setSecrets(snap.docs.map((d) => toSecret(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        logListenerError("useAppSecrets", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [appId]);

  return { secrets, loading };
}

const ANALYTICS_WINDOW_DAYS = 30;

function toDailyAnalytics(id: string, data: any): DailyAnalytics {
  return {
    date: id,
    total: data.total ?? 0,
    countries: data.countries ?? {},
    referrers: data.referrers ?? {},
    devices: data.devices ?? {},
    paths: data.paths ?? {},
  };
}

/**
 * The last 30 days of one app's visit rollup (see lib/traffic-guard.ts's
 * recordView) — day-doc ids are "YYYY-MM-DD", which sorts correctly as a
 * plain string, so orderBy(documentId()) needs no separate date field.
 * Empty (not an error) whenever FIREBASE_SERVICE_ACCOUNT isn't configured
 * on this deployment, since that's the only path that ever writes these.
 */
export function useAppAnalytics(appId: string | undefined) {
  const [days, setDays] = useState<DailyAnalytics[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appId) {
      setDays([]);
      setLoading(false);
      return;
    }
    const q = query(
      collection(db, "apps", appId, "analytics"),
      orderBy("__name__"),
      limitToLast(ANALYTICS_WINDOW_DAYS)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDays(snap.docs.map((d) => toDailyAnalytics(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        logListenerError("useAppAnalytics", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [appId]);

  return { days, loading };
}

export async function addAppSecret(
  appId: string,
  userId: string,
  key: string,
  value: string
): Promise<void> {
  const ref = doc(collection(db, "apps", appId, "secrets"));
  await setDoc(ref, { userId, key, value, createdAt: serverTimestamp() });
}

export async function deleteAppSecret(appId: string, secretId: string): Promise<void> {
  await deleteDoc(doc(db, "apps", appId, "secrets", secretId));
}

export function useApp(appId: string | undefined) {
  const [app, setApp] = useState<FeatherApp | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appId) {
      setApp(null);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      doc(db, "apps", appId),
      (snap) => {
        setApp(snap.exists() ? toApp(snap.id, snap.data()) : null);
        setLoading(false);
      },
      (err) => {
        logListenerError("useApp", err);
        setApp(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [appId]);

  return { app, loading };
}
