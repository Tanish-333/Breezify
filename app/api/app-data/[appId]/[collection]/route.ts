import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, listCollection } from "@/lib/firestore-rest";

export const runtime = "nodejs";

// Keeps path segments as plain identifiers, no "..", "/", or other
// characters that could be read as a different Firestore path.
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

function badPath() {
  return NextResponse.json({ error: "Invalid app or collection." }, { status: 400 });
}

/**
 * The generic per-app data store generated apps use for real persistence
 * (see components/app-secrets-dialog.tsx's sibling feature, and
 * firestore.rules' `app_data` match for the security model). appId scopes
 * every record to one Breezify app; "collection" is a free-form table name
 * the generated app picks, e.g. "todos" or "comments".
 *
 * Callers authenticate as any signed-in Firebase user, including anonymous
 * auth (generated apps sign visitors in anonymously via the Identity
 * Toolkit REST API using Breezify's own public Firebase config), so a
 * visitor never needs a Breezify account. Firestore rules, not this route,
 * are what actually stop one visitor from editing another's records.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { appId: string; collection: string } }
) {
  const { appId, collection } = params;
  if (!ID_RE.test(appId) || !ID_RE.test(collection)) return badPath();
  try {
    const docs = await listCollection(`app_data/${appId}/${collection}`);
    return NextResponse.json({
      records: docs.map((d) => ({ id: d.id, ...d.fields })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list records.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { appId: string; collection: string } }
) {
  const { appId, collection } = params;
  if (!ID_RE.test(appId) || !ID_RE.test(collection)) return badPath();

  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
  }

  let uid: string;
  try {
    uid = (await verifyIdToken(idToken)).uid;
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

  const docId = randomUUID();
  const data = {
    // Always the caller's own uid, regardless of anything the client sent,
    // since this is what firestore.rules checks a record's owner against.
    ...(body as Record<string, unknown>),
    ownerUid: uid,
    createdAt: new Date(),
  };

  try {
    await commit([createWrite(`app_data/${appId}/${collection}/${docId}`, data)], idToken);
    return NextResponse.json({ id: docId, ...data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create record.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
