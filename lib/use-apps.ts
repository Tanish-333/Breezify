"use client";

import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FeatherApp } from "@/lib/types";

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
    deployedUrl: data.deployedUrl,
    subdomain: data.subdomain,
    errorMessage: data.errorMessage,
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
