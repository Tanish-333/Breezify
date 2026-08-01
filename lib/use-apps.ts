"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AppTurn, FeatherApp } from "@/lib/types";

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
      () => setLoading(false)
    );
    return () => unsub();
  }, [uid]);

  return { apps, loading };
}

export async function deleteApp(appId: string) {
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
      files,
      createdAt: new Date(),
    }),
  ]);
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
      () => setLoading(false)
    );
    return () => unsub();
  }, [appId]);

  return { app, loading };
}
