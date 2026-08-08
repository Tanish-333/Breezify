// Minimal Firestore REST client used server-side. Every call is authenticated
// with the caller's own Firebase ID token (the same token the client SDK
// would use), so writes are evaluated against firestore.rules exactly as if
// they came from the browser. No service account or admin credentials
// involved, just the standard Firestore REST API.

import { FIREBASE_PUBLIC_CONFIG } from "@/lib/firebase-public-config";

const PROJECT_ID = FIREBASE_PUBLIC_CONFIG.projectId;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

type FirestoreValue =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { mapValue: { fields: Record<string, FirestoreValue> } }
  | { arrayValue: { values: FirestoreValue[] } };

export function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return { nullValue: null };
  // Dates must round-trip as real Firestore timestamps, otherwise the client
  // SDK reads them back as plain strings and .toMillis() is unavailable.
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value as Record<string, unknown>) } };
  }
  throw new Error(`Unsupported Firestore value type: ${typeof value}`);
}

export function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function fromFirestoreValue(value: any): unknown {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("mapValue" in value) return fromFirestoreFields(value.mapValue.fields ?? {});
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  return null;
}

export function fromFirestoreFields(fields: Record<string, any>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    obj[key] = fromFirestoreValue(value);
  }
  return obj;
}

function docName(path: string) {
  return `projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function firestoreFetch(url: string, idToken: string | null, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

export async function getDoc(
  path: string,
  idToken: string
): Promise<{ fields: Record<string, unknown> } | null> {
  const res = await firestoreFetch(`${BASE}/${path}`, idToken);
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore GET ${path} failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return { fields: fromFirestoreFields(data.fields ?? {}) };
}

export interface FirestoreWrite {
  update?: { name: string; fields: Record<string, FirestoreValue> };
  updateMask?: { fieldPaths: string[] };
  transform?: {
    document: string;
    fieldTransforms: { fieldPath: string; increment: FirestoreValue }[];
  };
  delete?: string;
}

/**
 * idToken is optional so a handful of narrow, unauthenticated writes (see
 * the public visit-counter increment in app/api/track) can go through as
 * request.auth == null in firestore.rules, which then must scope exactly
 * what an anonymous caller is allowed to touch.
 */
export async function commit(writes: FirestoreWrite[], idToken?: string | null): Promise<void> {
  const res = await firestoreFetch(`${BASE}:commit`, idToken ?? null, {
    method: "POST",
    body: JSON.stringify({ writes }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore commit failed (${res.status}): ${body}`);
  }
}

/**
 * Pulls the underlying HTTP status back out of an error thrown by commit()
 * or getDoc() (both format as "... failed (STATUS): body"), so a route that
 * caught the error can report the real cause (e.g. a rules rejection is a
 * 403, not a generic 500) instead of guessing.
 */
export function firestoreErrorStatus(err: unknown, fallback = 500): number {
  const match = err instanceof Error ? /\((\d{3})\)/.exec(err.message) : null;
  return match ? Number(match[1]) : fallback;
}

export function updateWrite(
  path: string,
  fields: Record<string, unknown>,
  mask?: string[]
): FirestoreWrite {
  return {
    update: { name: docName(path), fields: toFirestoreFields(fields) },
    updateMask: { fieldPaths: mask ?? Object.keys(fields) },
  };
}

export function createWrite(path: string, fields: Record<string, unknown>): FirestoreWrite {
  return { update: { name: docName(path), fields: toFirestoreFields(fields) } };
}

export function incrementWrite(path: string, fieldPath: string, delta: number): FirestoreWrite {
  return {
    transform: {
      document: docName(path),
      fieldTransforms: [{ fieldPath, increment: toFirestoreValue(delta) }],
    },
  };
}

export function deleteWrite(path: string): FirestoreWrite {
  return { delete: docName(path) };
}

/**
 * Lists every document directly inside a collection at `path` (e.g.
 * "app_data/{appId}/{collection}"), unauthenticated by default so public
 * reads (see firestore.rules' `app_data` match) work without a token.
 */
export async function listCollection(
  path: string,
  idToken?: string | null,
  pageSize = 200
): Promise<{ id: string; fields: Record<string, unknown> }[]> {
  const res = await firestoreFetch(`${BASE}/${path}?pageSize=${pageSize}`, idToken ?? null);
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore list ${path} failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { documents?: { name: string; fields?: Record<string, any> }[] };
  return (data.documents ?? []).map((d) => ({
    id: d.name.split("/").pop()!,
    fields: fromFirestoreFields(d.fields ?? {}),
  }));
}

export async function queryCollection(
  collectionId: string,
  field: string,
  value: string,
  idToken: string
): Promise<{ id: string; fields: Record<string, unknown> }[]> {
  const res = await firestoreFetch(`${BASE}:runQuery`, idToken, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: toFirestoreValue(value),
          },
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore query failed (${res.status}): ${body}`);
  }
  const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, any> } }[];
  return rows
    .filter((r) => r.document)
    .map((r) => ({
      id: r.document!.name.split("/").pop()!,
      fields: fromFirestoreFields(r.document!.fields ?? {}),
    }));
}

/**
 * Same as queryCollection, but scoped to a specific parent document's
 * subcollection (e.g. apps/{appId}/versions) rather than a database-wide
 * collection. Needed wherever a subcollection's security rule checks a
 * field on each document itself (e.g. versions/{turnId}'s `resource.data.
 * userId`, see firestore.rules) rather than via a parent get() — Firestore
 * can only allow a `list`/query request when it can prove EVERY document
 * the query could return satisfies the rule, and it can only prove that
 * from the query's own shape (a matching `where` clause), never from
 * inspecting results after the fact. listCollection()'s plain "list
 * everything in this subcollection" call has no such clause, so Firestore
 * rejects it outright with PERMISSION_DENIED the moment a rule like that
 * is in play — regardless of whether every document actually does belong
 * to the caller. Filtering by the exact field the rule checks is what
 * lets Firestore verify the request is safe and actually allow it.
 */
export async function querySubcollection(
  parentPath: string,
  collectionId: string,
  field: string,
  value: string,
  idToken: string
): Promise<{ id: string; fields: Record<string, unknown> }[]> {
  const res = await firestoreFetch(`${BASE}/${parentPath}:runQuery`, idToken, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: toFirestoreValue(value),
          },
        },
      },
    }),
  });
  if (res.status === 404) return [];
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore query ${parentPath}/${collectionId} failed (${res.status}): ${body}`);
  }
  const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, any> } }[];
  return rows
    .filter((r) => r.document)
    .map((r) => ({
      id: r.document!.name.split("/").pop()!,
      fields: fromFirestoreFields(r.document!.fields ?? {}),
    }));
}

const DOCUMENTS_PREFIX = `projects/${PROJECT_ID}/databases/(default)/documents/`;

/**
 * Same as queryCollection, but across every subcollection named
 * `collectionId` regardless of parent (Firestore's "collection group"
 * query) — e.g. every apps/{appId}/collaborators/{uid} doc for a given uid,
 * spanning apps this caller doesn't own. Returns the full relative path
 * (not just the doc id) since the caller usually needs it to build a write
 * against a parent it doesn't already know.
 */
export async function queryCollectionGroup(
  collectionId: string,
  field: string,
  value: string,
  idToken: string
): Promise<{ path: string; fields: Record<string, unknown> }[]> {
  const res = await firestoreFetch(`${BASE}:runQuery`, idToken, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId, allDescendants: true }],
        where: {
          fieldFilter: {
            field: { fieldPath: field },
            op: "EQUAL",
            value: toFirestoreValue(value),
          },
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Firestore collection-group query failed (${res.status}): ${body}`);
  }
  const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, any> } }[];
  return rows
    .filter((r) => r.document)
    .map((r) => ({
      path: r.document!.name.slice(DOCUMENTS_PREFIX.length),
      fields: fromFirestoreFields(r.document!.fields ?? {}),
    }));
}
