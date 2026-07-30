import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Firebase throws synchronously if NEXT_PUBLIC_FIREBASE_* env vars aren't set
// yet (e.g. before the user has connected their Firebase project). Fall back
// gracefully so the rest of the app still renders. auth-context treats a
// null `auth` as "signed out" instead of crashing.
let authInstance: ReturnType<typeof getAuth> | null = null;
let dbInstance: ReturnType<typeof getFirestore> | null = null;
try {
  authInstance = getAuth(firebaseApp);
  dbInstance = getFirestore(firebaseApp);
} catch (err) {
  if (typeof window !== "undefined") {
    console.warn(
      "Firebase failed to initialize. Add your Firebase config to .env.local (see .env.example).",
      err
    );
  }
}

export const auth = authInstance as ReturnType<typeof getAuth>;
export const db = dbInstance as ReturnType<typeof getFirestore>;
export const isFirebaseConfigured = authInstance !== null;

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");
