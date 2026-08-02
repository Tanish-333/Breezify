"use client";

import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { FeatherUser } from "@/lib/types";

// Firestore Timestamps aren't plain JSON, so convert them (and anything
// nested inside turns/versions) to ISO strings on the way out.
function replacer(_key: string, value: unknown) {
  if (value && typeof value === "object" && typeof (value as any).toDate === "function") {
    return (value as any).toDate().toISOString();
  }
  return value;
}

/**
 * Everything Breezify has stored about this account, as a single JSON
 * download: profile, generated apps, and credit/billing history. Reads
 * go through the same client SDK + firestore.rules every other page uses
 * (isOwner-scoped), no separate API route needed.
 */
export async function downloadUserData(uid: string, profile: FeatherUser | null) {
  const [appsSnap, txSnap] = await Promise.all([
    getDocs(query(collection(db, "apps"), where("userId", "==", uid))),
    getDocs(query(collection(db, "transactions"), where("userId", "==", uid))),
  ]);

  const data = {
    exportedAt: new Date().toISOString(),
    profile,
    apps: appsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    transactions: txSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };

  const blob = new Blob([JSON.stringify(data, replacer, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `breezify-data-${uid.slice(0, 8)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
