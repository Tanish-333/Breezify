import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, firestoreErrorStatus, listCollection } from "@/lib/firestore-rest";
import { corsPreflight, withCors } from "@/lib/cors";

export const runtime = "nodejs";

export async function OPTIONS() {
  return corsPreflight();
}

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
 *
 * Every response here goes through withCors(): the caller is always a
 * generated app running on a different origin (the sandboxed preview's
 * opaque origin, or its own separate *.vercel.app once deployed), never
 * this app itself — see lib/cors.ts for why that made this whole feature
 * silently unusable without it.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { appId: string; collection: string } }
) {
  const { appId, collection } = params;
  if (!ID_RE.test(appId) || !ID_RE.test(collection)) return withCors(badPath());
  try {
    const docs = await listCollection(`app_data/${appId}/${collection}`);
    return withCors(
      NextResponse.json({
        records: docs.map((d) => ({ id: d.id, ...d.fields })),
      })
    );
  } catch {
    return withCors(NextResponse.json({ error: "Failed to list records." }, { status: 500 }));
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { appId: string; collection: string } }
) {
  const { appId, collection } = params;
  if (!ID_RE.test(appId) || !ID_RE.test(collection)) return withCors(badPath());

  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!idToken) {
    return withCors(NextResponse.json({ error: "Missing authorization token." }, { status: 401 }));
  }

  let uid: string;
  try {
    uid = (await verifyIdToken(idToken)).uid;
  } catch {
    return withCors(NextResponse.json({ error: "Invalid or expired token." }, { status: 401 }));
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return withCors(NextResponse.json({ error: "Body must be JSON." }, { status: 400 }));
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return withCors(NextResponse.json({ error: "Body must be a JSON object." }, { status: 400 }));
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
    return withCors(NextResponse.json({ id: docId, ...data }));
  } catch (err) {
    const status = firestoreErrorStatus(err);
    const message = status === 403 ? "You don't have permission to create this record." : "Failed to create record.";
    return withCors(NextResponse.json({ error: message }, { status }));
  }
}
