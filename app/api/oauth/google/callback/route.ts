import { NextRequest, NextResponse } from "next/server";
import { verifyState } from "@/lib/google-oauth-state";
import { adminAuth, isFirebaseAdminConfigured } from "@/lib/firebase-admin";

export const runtime = "nodejs";

function appBaseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
}

/**
 * Tiny self-closing page that hands the sign-in result back to the
 * generated app's own window via postMessage, targeted at the origin
 * app/api/oauth/google/start already validated for this appId — never at
 * "*", so nothing but that specific app's own window can ever read it.
 */
function resultPage(origin: string, payload: Record<string, unknown>) {
  const message = JSON.stringify({ type: "breezify-google-auth", ...payload });
  const targetOrigin = JSON.stringify(origin);
  return `<!doctype html>
<html><body>
<script>
(function () {
  try {
    if (window.opener) window.opener.postMessage(${message}, ${targetOrigin});
  } catch (e) {}
  window.close();
})();
</script>
</body></html>`;
}

const HTML_HEADERS = { "Content-Type": "text/html; charset=utf-8" };

/**
 * Second leg of the Google sign-in proxy (see .../start/route.ts). Google
 * redirects the popup here with a ?code; this exchanges it server-side
 * (client_secret never touches the browser), mints a Firebase custom
 * token for uid `google:<sub>` — not scoped per app, since a real Google
 * identity has no password to collide the way lib/generation/prompt.ts's
 * namespaced email/password accounts do — and hands it back. The
 * generated app then exchanges that custom token for a real Firebase
 * idToken via the same identitytoolkit signInWithCustomToken REST call
 * documented in the system prompt, so app/api/app-data's existing
 * Bearer-token handling needs no changes at all for this to work.
 */
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateToken = req.nextUrl.searchParams.get("state") ?? "";
  const state = verifyState(stateToken);

  if (!state) {
    return new NextResponse(
      "This sign-in link expired or is invalid. Close this window and try again.",
      { status: 400 }
    );
  }

  if (!code) {
    // The visitor hit "Cancel" on Google's consent screen — a real outcome,
    // not an error to log.
    return new NextResponse(resultPage(state.origin, { ok: false, error: "Sign-in was cancelled." }), {
      headers: HTML_HEADERS,
    });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret || !isFirebaseAdminConfigured()) {
    return new NextResponse("Google sign-in isn't configured on this deployment yet.", { status: 503 });
  }

  try {
    const redirectUri = `${appBaseUrl(req)}/api/oauth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || typeof tokenData.access_token !== "string") {
      throw new Error(tokenData.error_description || "Google token exchange failed.");
    }

    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || typeof profile.sub !== "string") {
      throw new Error("Couldn't load the Google profile.");
    }

    const customToken = await adminAuth().createCustomToken(`google:${profile.sub}`, {
      provider: "google",
      appId: state.appId,
    });

    return new NextResponse(
      resultPage(state.origin, {
        ok: true,
        customToken,
        email: typeof profile.email === "string" ? profile.email : null,
        name: typeof profile.name === "string" ? profile.name : null,
        picture: typeof profile.picture === "string" ? profile.picture : null,
      }),
      { headers: HTML_HEADERS }
    );
  } catch (err) {
    console.error(`[oauth/google/callback] appId=${state.appId}:`, err);
    const message = err instanceof Error ? err.message : "Google sign-in failed.";
    return new NextResponse(resultPage(state.origin, { ok: false, error: message }), {
      headers: HTML_HEADERS,
    });
  }
}
