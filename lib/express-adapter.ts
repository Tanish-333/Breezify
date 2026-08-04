/**
 * Vercel never keeps a process running — every request spins up a fresh
 * serverless function and tears it down, so `app.listen(...)` has nothing
 * to bind to. But an Express `app` instance is itself just a
 * `(req, res) => void` handler, which is exactly what a Vercel Node
 * function expects, so a SIMPLE Express backend (no separate frontend to
 * route around, no WebSocket/long-lived-connection code, exactly one
 * `.listen()` call) can be deployed for real by mechanically stripping the
 * `.listen()` call and exporting the app from api/index.<ext> instead.
 *
 * This is deliberately conservative: anything that isn't a single, plain
 * Express entry file is left alone, and unsupportedReason()'s normal
 * rejection still applies to it. A silently-wrong deploy is worse than a
 * clear "can't do this" message, so this only fires when the transform can
 * be done with confidence.
 */

import posixPath from "node:path/posix";

const ENTRY_NAME_RE = /(^|\/)(server|backend|app|index)\.(js|ts|mjs|cjs)$/i;
const EXPRESS_IMPORT_RE = /require\(["']express["']\)|from\s+["']express["']/;
const LISTEN_CALL_RE = /\b([A-Za-z_$][\w$]*)\.listen\s*\(/;
const WEBSOCKET_RE = /require\(["'](ws|socket\.io)["']\)|from\s+["'](ws|socket\.io)["']|WebSocketServer|\.upgrade\s*\(/;
const FRONTEND_MARKER_RE = /\.html$|vite\.config\.[jt]s$/i;
const RELATIVE_SPEC_RE = /(from\s+|require\(\s*)(["'])(\.[^"']+)\2/g;

interface WrapResult {
  files: Record<string, string>;
  note: string;
}

function countMatches(re: RegExp, text: string): number {
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return (text.match(global) ?? []).length;
}

/** Balanced-paren scan from an opening "(" to its matching ")", string/template-literal aware. */
function findMatchingParen(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = openIndex; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function stripListenCall(
  source: string,
  varName: string
): { code: string; exported: boolean } | null {
  const callRe = new RegExp(`\\b${varName}\\.listen\\s*\\(`);
  const match = callRe.exec(source);
  if (!match) return null;

  const openParen = match.index + match[0].length - 1;
  const closeParen = findMatchingParen(source, openParen);
  if (closeParen === -1) return null;

  // Absorb a `require.main === module` guard around the call, and a
  // trailing semicolon, so nothing dangling is left behind.
  let start = match.index;
  let end = closeParen + 1;
  if (source[end] === ";") end++;

  const guardRe = /if\s*\(\s*require\.main\s*===\s*module\s*\)\s*\{\s*$/;
  const before = source.slice(0, start);
  const guardMatch = guardRe.exec(before.slice(Math.max(0, before.length - 80)));
  if (guardMatch) {
    const guardStart = before.length - (before.slice(Math.max(0, before.length - 80)).length - guardMatch.index);
    // Find the guard's closing brace right after the (now-removed) call.
    let depth = 1;
    let i = end;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    if (depth === 0) {
      start = guardStart;
      end = i;
    }
  }

  const code = source.slice(0, start) + source.slice(end);
  const exported =
    new RegExp(`module\\.exports\\s*=\\s*${varName}\\b`).test(code) ||
    new RegExp(`export\\s+default\\s+${varName}\\b`).test(code);
  return { code, exported };
}

/**
 * Attempts to turn a simple Express server into a Vercel-deployable
 * serverless function. Returns null if the app isn't a good fit for this
 * (multi-server, WebSockets, has its own separate frontend to route around,
 * or the entry file isn't found/unambiguous) — the normal "unsupported"
 * message still applies in that case.
 */
export function tryWrapExpressForVercel(files: Record<string, string>): WrapResult | null {
  const paths = Object.keys(files);

  // A repo with its own frontend needs routing decisions this transform
  // doesn't attempt to make safely (which paths are static vs. API).
  if (paths.some((p) => FRONTEND_MARKER_RE.test(p))) return null;

  const totalListenCalls = paths.reduce(
    (sum, p) => sum + countMatches(LISTEN_CALL_RE, files[p]),
    0
  );
  if (totalListenCalls !== 1) return null;

  const hasWebSocket = paths.some((p) => WEBSOCKET_RE.test(files[p]));
  if (hasWebSocket) return null;

  const entry = paths.find(
    (p) => ENTRY_NAME_RE.test(p) && EXPRESS_IMPORT_RE.test(files[p]) && LISTEN_CALL_RE.test(files[p])
  );
  if (!entry) return null;

  const listenMatch = LISTEN_CALL_RE.exec(files[entry]);
  if (!listenMatch) return null;
  const varName = listenMatch[1];

  const stripped = stripListenCall(files[entry], varName);
  if (!stripped) return null;

  const isEsm = /\bexport\s|from\s+["']/.test(files[entry]) && !/module\.exports/.test(files[entry]);
  let code = stripped.code;
  if (!stripped.exported) {
    code += isEsm ? `\nexport default ${varName};\n` : `\nmodule.exports = ${varName};\n`;
  }

  // The entry file moves to api/, which changes what its relative imports
  // need to point at: e.g. backend/server.js requiring "./routes" means
  // backend/routes, but api/index.js requiring "./routes" would wrongly
  // mean api/routes. Re-resolve each specifier against the entry's OLD
  // directory, then re-express that same target relative to api/, using
  // POSIX path math rather than a naive depth-count (which breaks as soon
  // as the entry file isn't at the repo root).
  const originalDir = posixPath.dirname(entry);
  const ext = entry.split(".").pop();
  const outPath = `api/index.${ext}`;
  const newDir = posixPath.dirname(outPath);
  code = code.replace(RELATIVE_SPEC_RE, (m, kw, q, spec) => {
    const target = posixPath.normalize(posixPath.join(originalDir, spec));
    let newSpec = posixPath.relative(newDir, target);
    if (!newSpec.startsWith(".")) newSpec = `./${newSpec}`;
    return `${kw}${q}${newSpec}${q}`;
  });

  const out: Record<string, string> = { ...files };
  delete out[entry];
  out[outPath] = code;

  let vercelConfig: { rewrites?: { source: string; destination: string }[] } = {};
  if (typeof out["vercel.json"] === "string") {
    try {
      vercelConfig = JSON.parse(out["vercel.json"]);
    } catch {
      vercelConfig = {};
    }
  }
  vercelConfig.rewrites = [
    ...(vercelConfig.rewrites ?? []).filter((r) => r.destination !== "/api"),
    { source: "/(.*)", destination: "/api" },
  ];
  out["vercel.json"] = JSON.stringify(vercelConfig, null, 2);

  return {
    files: out,
    note: `Deployed ${entry} as a Vercel serverless function (its own always-on server code doesn't run there, so app.listen() was removed and every request is now routed to it directly).`,
  };
}
