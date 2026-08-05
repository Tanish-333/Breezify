// Backend correctness check: a generated app's api/ serverless functions
// read secrets from process.env.<KEY> (see the system prompt in
// lib/generation/prompt.ts and components/app-secrets-dialog.tsx), but
// nothing previously checked whether the keys a function actually reads
// were ever configured. A backend that expects STRIPE_SECRET_KEY and
// doesn't get it deploys clean — Vercel has nothing to reject — and only
// fails once a visitor actually triggers that code path, as an
// undifferentiated 500 with no obvious cause. This surfaces the gap before
// that happens instead of after.

const ENV_REF_RE = /process\.env\.([A-Z][A-Z0-9_]*)/g;
const API_DIR_RE = /^api\//i;

// Vercel sets these on every deployment; a function reading one of these
// isn't missing anything a user needs to configure in the Secrets panel.
const BUILTIN_ENV_VARS = new Set([
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_REGION",
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_PROVIDER",
  "VERCEL_GIT_REPO_SLUG",
]);

/** Every process.env.<KEY> referenced across this app's api/ backend files (never the static frontend, which can't read server env vars at all). */
export function referencedEnvVars(files: Record<string, string>): string[] {
  const found = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    if (!API_DIR_RE.test(path)) continue;
    ENV_REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ENV_REF_RE.exec(content)) !== null) {
      if (!BUILTIN_ENV_VARS.has(m[1])) found.add(m[1]);
    }
  }
  return Array.from(found).sort();
}

/** Env vars this app's backend reads that aren't among `configuredKeys` (this app's Secrets panel entries). */
export function missingEnvVars(files: Record<string, string>, configuredKeys: string[]): string[] {
  const configured = new Set(configuredKeys);
  return referencedEnvVars(files).filter((key) => !configured.has(key));
}
