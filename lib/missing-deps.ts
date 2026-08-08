// Dependency-completeness check: the generation prompt (lib/generation/
// prompt.ts) tells the model every bare import must have a matching entry in
// package.json's "dependencies", but the live preview can't catch a model
// that forgets one — buildPreview() (lib/preview.ts) resolves every bare
// import straight from a CDN regardless of what package.json says, so a
// missing entry renders perfectly in preview and only fails once Vercel runs
// a real `npm install`. This re-derives the same check server-side, before
// the deploy that would otherwise fail on it.

const IMPORT_RE = /\b(?:from\s*|import\s*\(\s*|require\s*\(\s*)(["'])([^"']+)\1/g;
const CODE_FILE_RE = /\.(tsx?|jsx?|mjs|cjs)$/;

// Resolved by Node itself, never something a package.json needs to declare.
const NODE_BUILTINS = new Set([
  "assert", "buffer", "child_process", "cluster", "crypto", "dgram", "dns",
  "events", "fs", "http", "https", "net", "os", "path", "process",
  "querystring", "readline", "stream", "string_decoder", "timers", "tls",
  "tty", "url", "util", "v8", "vm", "zlib",
]);

/** The npm package name a bare import specifier resolves to, or null for a relative/alias/URL/builtin specifier that needs no package.json entry. */
function packageName(spec: string): string | null {
  if (spec.startsWith(".") || spec.startsWith("@/") || spec.startsWith("http") || spec.startsWith("node:")) {
    return null;
  }
  const parts = spec.split("/");
  const name = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return NODE_BUILTINS.has(name) ? null : name;
}

/** Every npm package bare-imported anywhere in this app's source files. */
export function referencedPackages(files: Record<string, string>): string[] {
  const found = new Set<string>();
  for (const [path, content] of Object.entries(files)) {
    if (!CODE_FILE_RE.test(path)) continue;
    IMPORT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = IMPORT_RE.exec(content)) !== null) {
      const pkg = packageName(m[2]);
      if (pkg) found.add(pkg);
    }
  }
  return Array.from(found).sort();
}

/** Packages this app imports that aren't listed in package.json's "dependencies" or "devDependencies" — each one is a guaranteed `npm install`/build failure on a real deploy. Returns [] if package.json is missing or unparseable, since that's a different failure this isn't trying to catch. */
export function missingDependencies(files: Record<string, string>): string[] {
  const raw = files["package.json"];
  if (!raw) return [];
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(raw);
  } catch {
    return [];
  }
  const declared = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ]);
  return referencedPackages(files).filter((name) => !declared.has(name));
}
