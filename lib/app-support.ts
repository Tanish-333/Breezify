/**
 * Breezify only ever runs a generated app as a static frontend: the live
 * preview is a sandboxed browser iframe with no server behind it, and Deploy
 * publishes a static Vite build to Vercel. Neither can run a real backend
 * process, and neither can supply a secret the generated code assumes
 * exists (nothing ever provisions one into a generated or deployed app).
 * This scans for the two ways that shows up as a silent, unexplained
 * failure instead of a clear one, so callers can say so plainly.
 */

const SERVER_ENTRY_RE = /^(server|backend)(\/|\.(js|ts|mjs|cjs)$)|^api\//i;
const SERVER_CODE_RE =
  /\b(express\s*\(|require\(["']express["']\)|from\s+["']express["']|createServer\s*\(|app\.listen\s*\()/;
const ASSUMED_KEY_RE = /process\.env\.[A-Z0-9_]*API_KEY/;

export function unsupportedReason(
  files: Record<string, string>,
  context: "preview" | "deploy"
): string | null {
  const paths = Object.keys(files);
  const action = context === "preview" ? "preview in the browser" : "be deployed as a static site";

  const hasServerEntry = paths.some((p) => SERVER_ENTRY_RE.test(p));
  const hasServerCode = Object.values(files).some((content) => SERVER_CODE_RE.test(content));
  if (hasServerEntry || hasServerCode) {
    return `This app includes real server/backend code, so it can't ${action}. Download the ZIP or push it to GitHub and run it locally with its own server instead.`;
  }

  const keyFile = paths.find((p) => ASSUMED_KEY_RE.test(files[p]));
  if (keyFile) {
    return `${keyFile} expects an API key from a server environment variable, but nothing sets one here, so that feature won't work here or once deployed. If this app needs AI or another external API, ask it to add a settings screen where you paste your own key instead.`;
  }

  return null;
}
