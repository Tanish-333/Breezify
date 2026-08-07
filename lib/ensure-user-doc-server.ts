import { getDoc } from "@/lib/firestore-rest";
import { claimSignup, getClientIp } from "@/lib/claim-signup";

/**
 * Reads users/{uid}, and self-heals it if missing rather than failing.
 *
 * The client calls /api/claim-signup right after sign-in/sign-up (see
 * lib/auth-context.tsx), but that call is best-effort — a network blip or a
 * closed tab can leave it never having run. The gap is that every server
 * route reading users/{uid} used to treat a missing doc as a hard failure
 * — "User account not found", a checkout that never links to a real
 * account, a billing portal that can't find a customer — for a real,
 * signed-in, verified user, with no way to recover short of contacting
 * support. This calls the exact same claimSignup() core claim-signup
 * itself uses (Admin SDK, same per-IP abuse cap on the bonus, same
 * dedupe against signups/{uid}) so self-healing here can never be used to
 * re-grant or bypass anything that path already guards against.
 */
export async function getOrCreateUserDoc(
  uid: string,
  idToken: string,
  email: string | undefined,
  headers: { get(name: string): string | null }
): Promise<{ fields: Record<string, unknown> } | null> {
  const existing = await getDoc(`users/${uid}`, idToken);
  if (existing) return existing;

  try {
    await claimSignup(uid, getClientIp(headers), email);
  } catch (err) {
    console.error(`[ensure-user-doc] self-heal failed for uid=${uid}:`, err);
    return null;
  }
  return getDoc(`users/${uid}`, idToken);
}
