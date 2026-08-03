import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, deleteWrite, firestoreErrorStatus, updateWrite } from "@/lib/firestore-rest";

export const runtime = "nodejs";

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function badPath() {
  return NextResponse.json({ error: "Invalid app, collection, or record id." }, { status: 400 });
}

/**
 * Update or delete one record. Ownership isn't checked in this route at
 * all: the write goes through with the caller's own ID token, and
 * firestore.rules' `app_data` match is what enforces
 * `resource.data.ownerUid == request.auth.uid` before it's allowed
 * through, exactly like every other write in this codebase.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { appId: string; collection: string; docId: string } }
) {
  const { appId, collection, docId } = params;
  if (!ID_RE.test(appId) || !ID_RE.test(collection) || !ID_RE.test(docId)) return badPath();

  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }
  try {
    await verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 });
  }
  // ownerUid/createdAt are never client-editable: omitting them from the
  // update mask leaves the stored values untouched, which is also what
  // firestore.rules checks the request against.
  const fields = { ...(body as Record<string, unknown>) };
  delete fields.ownerUid;
  delete fields.createdAt;
  delete fields.id;
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    await commit(
      [updateWrite(`app_data/${appId}/${collection}/${docId}`, fields, Object.keys(fields))],
      idToken
    );
    return NextResponse.json({ id: docId, ...fields });
  } catch (err) {
    const status = firestoreErrorStatus(err);
    const message =
      status === 403 ? "You don't have permission to edit this record." : "Failed to update record.";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { appId: string; collection: string; docId: string } }
) {
  const { appId, collection, docId } = params;
  if (!ID_RE.test(appId) || !ID_RE.test(collection) || !ID_RE.test(docId)) return badPath();

  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }
  try {
    await verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 401 });
  }

  try {
    await commit([deleteWrite(`app_data/${appId}/${collection}/${docId}`)], idToken);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const status = firestoreErrorStatus(err);
    const message =
      status === 403 ? "You don't have permission to delete this record." : "Failed to delete record.";
    return NextResponse.json({ error: message }, { status });
  }
}
