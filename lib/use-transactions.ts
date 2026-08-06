"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
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
 * `max` transactions `useTransactions` loads for display.
 *
 * This used to run a server-side sum() aggregate query instead of a plain
 * listener, to avoid pulling every transaction doc down just to add up one
 * number. In practice that was the one thing on the whole Billing page that
 * kept coming back broken ("Unavailable") — aggregate queries are a newer,
 * less battle-tested Firestore code path than a plain where()-filtered
 * onSnapshot listener, and this app already leans on exactly that plain
 * pattern successfully everywhere else (including the transaction list
 * right next to this stat on the same page). Trading a bit of read volume
 * for reliability: this now sums client-side from the same kind of live
 * listener already proven to work, rather than a second, different code
 * path that keeps failing in ways this app has no visibility into.
 */
export function useLifetimeCreditsUsed(uid: string | undefined) {
  const [total, setTotal] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!uid) {
      setTotal(null);
      setStatus("loading");
      return;
    }
    setStatus("loading");
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", uid),
      where("type", "==", "generation")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        let sum = 0;
        for (const d of snap.docs) {
          const used = d.data().creditsUsed;
          if (typeof used === "number") sum += used;
        }
        setTotal(sum);
        setStatus("ready");
      },
      (err) => {
        // Surfaced so a real failure (e.g. a rules problem) shows up in the
        // console instead of looking identical to "still loading" forever
        // with no way to tell the two apart.
        console.error("[use-transactions] lifetime credits listener failed:", err);
        setTotal(null);
        setStatus("error");
      }
    );
    return unsub;
  }, [uid]);

  return { total, status };
}
