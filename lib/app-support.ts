/**
 * Breezify deploys a generated app's frontend as a static Vite build, plus
 * (optionally) an `api/` folder deployed as real Vercel serverless
 * functions — see lib/vercel-deploy.ts. The live preview is a sandboxed
 * browser iframe with no server behind it at all, so `api/` routes can
 * never run there even though they work fine once deployed. Neither
 * preview nor deploy can run a traditional always-on server process
 * (Express, a raw `createServer`/`.listen()`), since Vercel functions are
 * strictly one-request-in-one-response-out. This scans for the ways that
 * shows up as a silent, unexplained failure instead of a clear one, so
 * callers can say so plainly.
 */

const PERSISTENT_SERVER_ENTRY_RE = /^(server|backend)(\/|\.(js|ts|mjs|cjs)$)/i;
// Merely importing/instantiating Express is fine now — lib/express-adapter.ts
// can turn a plain Express app (no .listen()) into a real Vercel serverless
// function. What actually can't run anywhere is something that BINDS to a
// port or keeps a connection open: createServer(...) or an actual .listen()
// call still present (i.e. one the adapter didn't or couldn't strip).
const PERSISTENT_SERVER_CODE_RE = /\b(createServer\s*\(|\.listen\s*\()/;
const API_DIR_RE = /^api\//i;
const ASSUMED_KEY_RE = /process\.env\.[A-Z0-9_]*API_KEY/;

export function unsupportedReason(
  files: Record<string, string>,
  context: "preview" | "deploy"
): string | null {
  const paths = Object.keys(files);
  const action = context === "preview" ? "preview in the browser" : "be deployed";

  // A traditional always-on server can't run in either context: Vercel
  // functions and the preview iframe are both request/response only.
  const hasServerEntry = paths.some((p) => PERSISTENT_SERVER_ENTRY_RE.test(p));
  const hasServerCode = Object.values(files).some((content) => PERSISTENT_SERVER_CODE_RE.test(content));
  if (hasServerEntry || hasServerCode) {
    return `This app includes a real always-on server process, which Breezify can't ${action} (backend logic here must be Vercel serverless functions in an api/ folder instead). Download the ZIP or push it to GitHub and run it locally with its own server instead.`;
  }

  // Client-side code reading a server env var can never work: nothing
  // injects secrets into the browser bundle. Backend api/ files are exempt
  // — those DO get the app's configured Secrets injected at deploy time.
  const keyFile = paths.find((p) => !API_DIR_RE.test(p) && ASSUMED_KEY_RE.test(files[p]));
  if (keyFile) {
    return `${keyFile} expects an API key from a server environment variable, but nothing sets one here, so that feature won't work here or once deployed. Move that call into an api/ backend route (its secrets come from this app's Secrets panel), or add a settings screen where you paste your own key instead.`;
  }

  return null;
}
