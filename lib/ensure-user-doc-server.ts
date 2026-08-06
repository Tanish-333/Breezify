import { commit, createWrite, getDoc } from "@/lib/firestore-rest";

const SIGNUP_BONUS_CREDITS = 5.0;

/**
 * Reads users/{uid}, and self-heals it if missing rather than failing.
 *
 * lib/auth-context.tsx's ensureUserDoc() writes this doc client-side right
 * after sign-in/sign-up, but that write is best-effort and swallows its own
 * errors (offline, a network blip, a closed tab mid-write) so the user is
 * never blocked from getting into the app over it. The gap is that every
 * server route reading users/{uid} used to treat a missing doc as a hard
 * failure — "User account not found", checkout that never links to a real
 * account, a billing portal that can't find a customer — for a real,
 * signed-in, verified user, with no way to recover short of contacting
 * support. This mirrors ensureUserDoc()'s own logic so the doc gets created
 * the moment any authenticated request notices it's missing, using the
 * caller's own idToken so it's still fully gated by firestore.rules.
 */
export async function getOrCreateUserDoc(
  uid: string,
  idToken: string,
  email?: string
): Promise<{ fields: Record<string, unknown> } | null> {
  const existing = await getDoc(`users/${uid}`, idToken);
  if (existing) return existing;

  // The signup bonus can only ever be granted once per uid (see
  // firestore.rules' signups/{userId} create rule) — if this uid already
  // claimed it and the profile doc is missing anyway (a stranger edge case:
  // the doc was lost after the bonus was already recorded), re-create
  // without a fresh bonus rather than fail the write outright.
  const signupDoc = await getDoc(`signups/${uid}`, idToken).catch(() => null);
  const base = {
    email: email ?? null,
    displayName: null,
    photoURL: null,
    plan: "free" as const,
    createdAt: new Date(),
    lastLoginAt: new Date(),
    authProviders: [],
  };

  const writes = signupDoc
    ? [createWrite(`users/${uid}`, { ...base, credits: 0 })]
    : [
        createWrite(`users/${uid}`, { ...base, credits: SIGNUP_BONUS_CREDITS }),
        createWrite(`signups/${uid}`, { claimedAt: new Date() }),
      ];

  try {
    await commit(writes, idToken);
  } catch (err) {
    console.error(`[ensure-user-doc] self-heal failed for uid=${uid}:`, err);
    return null;
  }
  return getDoc(`users/${uid}`, idToken);
}
