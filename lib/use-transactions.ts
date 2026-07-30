"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
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
    const q = query(
      collection(db, "transactions"),
      where("userId", "==", uid),
      orderBy("createdAt", "desc"),
      limit(max)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setTransactions(
          snap.docs.map((d) => {
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
          })
        );
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [uid, max]);

  return { transactions, loading };
}
