import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { FIREBASE_PUBLIC_CONFIG } from "@/lib/firebase-public-config";

export const firebaseApp = getApps().length ? getApp() : initializeApp(FIREBASE_PUBLIC_CONFIG);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const isFirebaseConfigured = true;

export const googleProvider = new GoogleAuthProvider();
export const githubProvider = new GithubAuthProvider();
export const appleProvider = new OAuthProvider("apple.com");

// Separate provider instance for "Connect GitHub" (pushing generated apps),
// which needs the repo scope. Kept apart from the sign-in provider above so
// logging in with GitHub never prompts for repo access it doesn't need.
export const githubRepoProvider = new GithubAuthProvider();
githubRepoProvider.addScope("repo");
