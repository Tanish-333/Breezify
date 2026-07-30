// Firebase's public web client config. Not secret, safe in the browser
// bundle and safe to read on the server without any admin credentials.
// Env vars override these for portability; the literals are Feather 123's
// own project so the app runs with zero required configuration.
export const FIREBASE_PUBLIC_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDJJUs4d0CC4RhAY2YfQPDSWX9MxOcm5hI",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "feather-123.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "feather-123",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "feather-123.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "1073871477156",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:1073871477156:web:f024ff09c2a6ebfb34c931",
};
