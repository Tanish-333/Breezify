import { NextRequest, NextResponse } from "next/server";
import { signState } from "@/lib/google-oauth-state";
import { isOriginForApp } from "@/lib/generated-app-origin";

export const runtime = "nodejs";

function appBaseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
}

/**
 * First leg of the Google sign-in proxy generated apps use (see the
 * "Google sign-in" section of lib/generation/prompt.ts's SYSTEM_PROMPT for
 * the client-side recipe). A generated app opens this in a popup with its
 * own appId + origin; this validates that pairing is real
 * (isOriginForApp), then redirects to Google's consent screen using
 * Breezify's own single OAuth client — never a per-app one, since that's
 * not something this shared backend can provision.
 */
export async function GET(req: NextRequest) {
  const appId = req.nextUrl.searchParams.get("appId") ?? "";
  const origin = req.nextUrl.searchParams.get("origin") ?? "";
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;

  if (!clientId || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
    return new NextResponse("Google sign-in isn't configured on this deployment yet.", { status: 503 });
  }
  if (!appId || !origin) {
    return new NextResponse("Missing appId or origin.", { status: 400 });
  }

  const allowed = await isOriginForApp(appId, origin);
  if (!allowed) {
    return new NextResponse("This origin isn't recognized for that app.", { status: 403 });
  }

  const state = signState({ appId, origin });
  const redirectUri = `${appBaseUrl(req)}/api/oauth/google/callback`;

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("prompt", "select_account");

  return NextResponse.redirect(authUrl.toString());
}
