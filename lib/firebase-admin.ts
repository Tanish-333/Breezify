// Firebase Admin SDK, used ONLY by the Stripe webhook (and nowhere else in
// this app). Every other Firestore write in Feather 123 goes through
// lib/firestore-rest.ts authenticated as the calling user, so security rules
// are the enforcement (see firestore.rules). A Stripe webhook has no user
// token at all, it's Stripe's server calling ours directly, so there's no
// identity for the rules to check. That gap is exactly what the Admin SDK
// exists to cover here: a narrow, service-account-authenticated exception
// scoped to "the webhook needs to set a user's plan after a real payment."
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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
