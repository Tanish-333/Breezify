// Firebase Admin SDK. Every ordinary Firestore write in Breezify goes
// through lib/firestore-rest.ts authenticated as the calling user, so
// security rules are the enforcement (see firestore.rules) — the Admin SDK
// is a narrow, service-account-authenticated exception for the couple of
// places that have no user token to work with, or need an Auth API the
// client SDK doesn't expose:
//   - the Stripe webhook (Stripe calls it directly, no user in the request)
//     uses adminDb() to set a user's plan/credits after a real payment.
//   - app/api/apps/[appId]/collaborators uses adminAuth() only, to resolve
//     an invited collaborator's email to a uid (Firebase Auth has no
//     client-readable email index) — the actual Firestore write it makes
//     still goes through the inviting owner's own idToken, so rules still
//     enforce ownership there.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { FIREBASE_PUBLIC_CONFIG } from "@/lib/firebase-public-config";

let app: App | null = null;

export function isFirebaseAdminConfigured() {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

function parseServiceAccount(): Record<string, unknown> {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error(
      "Webhook can't update accounts: FIREBASE_SERVICE_ACCOUNT isn't set. Paste the service account JSON from Firebase Console -> Project settings -> Service accounts -> Generate new private key."
    );
  }
  // Accept the JSON pasted directly, or base64-encoded (some env var UIs
  // mangle raw newlines inside the private_key field; base64 sidesteps that).
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
  }
}

function getAdminApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length) {
    app = existing[0];
    return app;
  }
  const serviceAccount = parseServiceAccount();
  app = initializeApp({
    credential: cert(serviceAccount as any),
    projectId: FIREBASE_PUBLIC_CONFIG.projectId,
  });
  return app;
}

export function adminDb() {
  return getFirestore(getAdminApp());
}

export function adminAuth() {
  return getAuth(getAdminApp());
}
