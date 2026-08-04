"use client";

import { useEffect, useState } from "react";
import { collection, getAggregateFromServer, onSnapshot, query, sum, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FeatherTransaction, ModelId, TransactionType } from "@/lib/types";

function toMillis(value: unknown): number {
  if (value && typeof value === "object" && "toMillis" in value) {
    return (value as { toMillis: () => number }).toMillis();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return Date.now();
}

export function useTransactions(uid: string | undefined, max = 50) {
  const [transactions, setTransactions] = useState<FeatherTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setTransactions([]);
      setLoading(false);
      return;
    }
    // Sorted and capped client-side rather than via orderBy()+limit() in the
    // query itself, so this doesn't depend on a composite index existing.
    // where("userId", "==", uid) alone only needs Firestore's automatic
    // single-field index, which always exists.
    const q = query(collection(db, "transactions"), where("userId", "==", uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            userId: data.userId,
            type: (data.type ?? "generation") as TransactionType,
            creditsUsed: data.creditsUsed,
            creditsAdded: data.creditsAdded,
            model: data.model as ModelId | undefined,
            actualCostUSD: data.actualCostUSD,
            createdAt: toMillis(data.createdAt),
          };
        });
        all.sort((a, b) => b.createdAt - a.createdAt);
        setTransactions(all.slice(0, max));
        setLoading(false);
      },
      (err) => {
        console.error("[use-transactions] snapshot failed:", err);
        // A broken listener must not leave the last-synced list frozen on
        // screen looking current.
        setTransactions([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid, max]);

  return { transactions, loading };
}

/**
 * Total credits spent across every generation, not just the most recent
 * `max` transactions `useTransactions` loads for display. Uses a server-side
 * sum aggregate rather than fetching every transaction document.
 */
export function useLifetimeCreditsUsed(uid: string | undefined) {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!uid) {
      setTotal(null);
      return;
    }
    let cancelled = false;
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", uid),
      where("type", "==", "generation")
    );
    getAggregateFromServer(q, { creditsUsed: sum("creditsUsed") })
      .then((snap) => {
        if (!cancelled) setTotal(snap.data().creditsUsed);
      })
      .catch(() => {
        if (!cancelled) setTotal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return total;
}
