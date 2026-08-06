// Shared helper for routes that let both an app's owner and its invited
// collaborators act on it (refine, deploy, duplicate, GitHub push/sync) —
// see components/collaborators-dialog.tsx for how collaborators get added
// and given a role. Deliberately NOT used by the domain or secrets routes:
// those stay owner-only, since they touch billing and API keys respectively.

import { getDoc } from "@/lib/firestore-rest";
import type { CollaboratorRole } from "@/lib/types";

/**
 * True for the owner, or a collaborator whose role isn't "viewer". A role
 * missing entirely (every collaborator doc written before roles existed)
 * is treated as "editor" — the only behavior that existed before this
 * distinction — so nobody's access silently narrows. Mirrors the
 * isAppEditor() rule in firestore.rules, which enforces the same thing for
 * every direct client write to apps/{appId} (rename, manual code edit,
 * revert) — this is the server-route side of the same policy.
 */
export async function hasEditAccess(
  appId: string,
  ownerUid: string,
  uid: string,
  idToken: string
): Promise<boolean> {
  if (ownerUid === uid) return true;
  const collaborator = await getDoc(`apps/${appId}/collaborators/${uid}`, idToken);
  if (!collaborator) return false;
  const role = collaborator.fields.role as CollaboratorRole | undefined;
  return role !== "viewer";
}
