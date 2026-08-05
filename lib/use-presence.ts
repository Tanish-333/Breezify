"use client";

import { useEffect, useRef, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// How often each viewer refreshes their own presence doc while the build
// page is open.
const HEARTBEAT_MS = 20_000;
// A viewer whose heartbeat hasn't refreshed within this long is treated as
// gone (closed tab, lost connection, crashed) rather than trusting the
// best-effort delete-on-unmount below to always fire.
const STALE_MS = 45_000;

export interface PresentViewer {
  uid: string;
  email: string;
}

/**
 * Live "who else is looking at this app right now" — each viewer heartbeats
 * their own apps/{appId}/presence/{uid} doc on an interval while mounted
 * (see firestore.rules for the matching read/write scope), and every
 * viewer's onSnapshot listener recomputes who else is still active from the
 * whole subcollection.
 *
 * Staleness is re-checked on its own timer, not only when a new snapshot
 * arrives: if the last other viewer goes silent (closed their laptop, lost
 * network) with nobody left to trigger a fresh write, onSnapshot simply
 * never fires again — without this, that viewer would show as "here" until
 * something else happened to touch the subcollection.
 */
export function usePresence(
  appId: string | undefined,
  uid: string | undefined,
  email: string | null | undefined
): PresentViewer[] {
  const [others, setOthers] = useState<PresentViewer[]>([]);
  const rawRef = useRef<{ uid: string; email: string; lastSeen: number }[]>([]);

  useEffect(() => {
    if (!appId || !uid) {
      setOthers([]);
      return;
    }
    const ownRef = doc(db, "apps", appId, "presence", uid);

    function recompute() {
      const now = Date.now();
      setOthers(
        rawRef.current
          .filter((v) => v.uid !== uid && now - v.lastSeen < STALE_MS)
          .map((v) => ({ uid: v.uid, email: v.email }))
      );
    }

    async function heartbeat() {
      try {
        await setDoc(ownRef, { email: email ?? "", lastSeen: serverTimestamp() });
      } catch {
        // Rules reject this once access is gone (e.g. removed as a
        // collaborator mid-session); nothing to do but stop trying.
      }
    }
    heartbeat();
    const heartbeatInterval = setInterval(heartbeat, HEARTBEAT_MS);
    const recomputeInterval = setInterval(recompute, 15_000);

    const unsub = onSnapshot(
      collection(db, "apps", appId, "presence"),
      (snap) => {
        rawRef.current = snap.docs.map((d) => {
          const data = d.data();
          return {
            uid: d.id,
            email: typeof data.email === "string" ? data.email : "",
            lastSeen: typeof data.lastSeen?.toMillis === "function" ? data.lastSeen.toMillis() : 0,
          };
        });
        recompute();
      },
      () => {
        // Permission changes (e.g. left/removed mid-session) just stop updating.
      }
    );

    return () => {
      clearInterval(heartbeatInterval);
      clearInterval(recomputeInterval);
      unsub();
      deleteDoc(ownRef).catch(() => {
        // Best-effort — the STALE_MS filter above covers a tab that closes
        // before this ever gets a chance to run.
      });
    };
  }, [appId, uid, email]);

  return others;
}
