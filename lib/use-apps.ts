"use client";

import { useEffect, useState } from "react";
import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { logClientError } from "@/lib/client-error-log";
import type { AppSecret, AppTurn, FeatherApp } from "@/lib/types";

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
    summary: data.summary,
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
    turns: Array.isArray(data.turns)
      ? data.turns.map((t: any) => ({ ...t, createdAt: toMillis(t.createdAt) ?? Date.now() }))
      : [],
    deployedUrl: data.deployedUrl,
    githubUrl: data.githubUrl,
    subdomain: data.subdomain,
    customDomain: data.customDomain,
    customDomainVerified: data.customDomainVerified,
    domainPurchased: data.domainPurchased,
    domainExpiresAt: toMillis(data.domainExpiresAt),
    domainAutoRenew: data.domainAutoRenew,
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
 * collection-group query filtered to documents whose own ID is this uid
 * finds every "membership" doc across all apps, then each matching app is
 * watched individually so the list stays live as membership or the app
 * itself changes.
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

    const q = query(collectionGroup(db, "collaborators"), where(documentId(), "==", uid));
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

// Firestore's client SDK batches also cap at 500 writes.
const BATCH_WRITE_LIMIT = 450;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * secrets and versions don't cascade-delete with their parent app doc
 * (Firestore never does this automatically), and both subcollections' own
 * rules check ownership via a get() on the parent app doc — so deleting the
 * app first would leave any leftover secrets (real third-party API keys)
 * or version snapshots not just orphaned, but permanently unreadable and
 * undeletable afterward. Clear the subcollections first.
 */
export async function deleteApp(appId: string) {
  const [secretsSnap, versionsSnap] = await Promise.all([
    getDocs(collection(db, "apps", appId, "secrets")),
    getDocs(collection(db, "apps", appId, "versions")),
  ]);
  const subcollectionRefs = [...secretsSnap.docs, ...versionsSnap.docs].map((d) => d.ref);

  for (const group of chunk(subcollectionRefs, BATCH_WRITE_LIMIT)) {
    const batch = writeBatch(db);
    for (const ref of group) batch.delete(ref);
    await batch.commit();
  }

  await deleteDoc(doc(db, "apps", appId));
}

/**
 * Copies an app's prompt, model, and generated files into a brand new app,
 * with a clean history (no turns, no deploy/GitHub links carried over). No
 * AI call involved, so it costs nothing to offer as a plan perk.
 */
export async function duplicateApp(app: FeatherApp, uid: string): Promise<string> {
  const ref = doc(collection(db, "apps"));
  await setDoc(ref, {
    userId: uid,
    name: `${app.name} (copy)`,
    prompt: app.prompt,
    model: app.model,
    status: "ready",
    summary: app.summary ?? "",
    suggestions: [],
    turns: [],
    generatedCode: app.generatedCode ?? { files: {} },
    createdAt: serverTimestamp(),
    visits: 0,
  });
  return ref.id;
}

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
      userId: app.userId,
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
