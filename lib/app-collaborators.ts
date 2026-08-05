// Shared helper for routes that let both an app's owner and its invited
// collaborators act on it (refine, deploy, GitHub push/sync) — see
// components/collaborators-dialog.tsx for how collaborators get added.
// Deliberately NOT used by the domain or secrets routes: those stay
// owner-only, since they touch billing and API keys respectively.

import { getDoc } from "@/lib/firestore-rest";

export async function hasAppAccess(
  appId: string,
  ownerUid: string,
  uid: string,
  idToken: string
): Promise<boolean> {
  if (ownerUid === uid) return true;
  const collaborator = await getDoc(`apps/${appId}/collaborators/${uid}`, idToken);
  return collaborator !== null;
}
