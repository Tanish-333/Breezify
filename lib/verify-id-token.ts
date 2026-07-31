import { createRemoteJWKSet, jwtVerify } from "jose";
import { FIREBASE_PUBLIC_CONFIG } from "@/lib/firebase-public-config";

// Verifies a Firebase Auth ID token using Google's public signing keys.
// This needs no service account or admin credentials: Firebase ID tokens are
// standard signed JWTs, and Google publishes the public keys used to sign
// them at a well-known JWKS URL. We just need our own (public) project ID to
// check the token was issued for this project.
const PROJECT_ID = FIREBASE_PUBLIC_CONFIG.projectId;

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function verifyIdToken(
  idToken: string
): Promise<{ uid: string; email?: string; emailVerified: boolean }> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID,
  });

  if (typeof payload.sub !== "string" || !payload.sub) {
    throw new Error("Invalid token: missing subject.");
  }

  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified: payload.email_verified === true,
  };
}
