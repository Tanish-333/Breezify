import { watermarkSnippet } from "@/lib/watermark";
import { unsupportedReason } from "@/lib/app-support";

/**
 * Builds a self-contained HTML document that runs a generated app inside a
 * sandboxed iframe.
 *
 * Generated projects are normally Vite/React sources that would need a build
 * step, so instead of bundling server-side we ship the sources to the iframe
 * and let Babel standalone transpile them in the browser. Relative imports are
 * resolved against a small in-page module registry; bare imports (react,
 * react-dom, etc.) are mapped to esm.sh.
 *
 * This handles the common single-page React app and plain static HTML. Apps
 * with a real backend, a database, or unusual build config won't run here, and
 * the caller shows a "download or deploy it" state instead.
 */

const SCRIPT_EXT = /\.(tsx|ts|jsx|js|mjs)$/;
const ENTRY_CANDIDATES = [
  "src/main.tsx",
  "src/main.ts",
  "src/main.jsx",
  "src/main.js",
  "src/index.tsx",
  "src/index.jsx",
  "src/index.ts",
  "src/index.js",
  "main.tsx",
  "index.tsx",
  "src/App.tsx",
  "src/App.jsx",
  "App.tsx",
];

export type PreviewResult =
  | { kind: "html"; doc: string }
  | { kind: "unsupported"; reason: string };

function findHtmlEntry(files: Record<string, string>) {
  return (
    Object.keys(files).find((p) => p === "index.html") ??
    Object.keys(files).find((p) => p.endsWith("index.html")) ??
    Object.keys(files).find((p) => p.toLowerCase().endsWith(".html"))
  );
}

function findScriptEntry(files: Record<string, string>) {
  for (const candidate of ENTRY_CANDIDATES) {
    if (files[candidate] !== undefined) return candidate;
  }
  return Object.keys(files).find((p) => SCRIPT_EXT.test(p) && !p.includes("test"));
}

/** True when the HTML file can stand on its own with no build step. */
function isStandaloneHtml(html: string) {
  // A Vite index.html has a module script pointing at a source file that
  // needs transpiling. An inline `type="module"` script with no such `src`
  // is just an ES module snippet and runs fine as-is, so only tags that are
  // both a module *and* point into src/ disqualify the page.
  const scriptTags = html.match(/<script\b[^>]*>/gi) ?? [];
  return !scriptTags.some(
    (tag) => /type=["']module["']/.test(tag) && /src=["']\.?\/?src\//.test(tag)
  );
}

function collectCss(files: Record<string, string>) {
  return Object.entries(files)
    .filter(([p]) => p.endsWith(".css"))
    .map(([, c]) => c)
    .join("\n");
}

/**
 * The iframe's sandbox deliberately omits `allow-same-origin` (see below):
 * combined with `allow-scripts`, that flag is a well-known way for
 * sandboxed content to escape the sandbox entirely. But an opaque-origin
 * iframe also can't touch the real localStorage/sessionStorage at all —
 * every read or write throws a SecurityError — and nearly every generated
 * app uses one or both (the system prompt tells the model to, for anything
 * that isn't shared/persisted via the backend data API). Without this,
 * that's an uncaught exception on first render for most apps. A working
 * in-memory polyfill fixes the crash without touching the sandbox's actual
 * security properties: it never persists across a reload either way, same
 * as before, it just no longer throws.
 */
const STORAGE_POLYFILL = `<script>
(function () {
  function makeStorage() {
    var data = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); },
      removeItem: function (k) { delete data[k]; },
      clear: function () { data = {}; },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; },
    };
  }
  try {
    Object.defineProperty(window, "localStorage", { value: makeStorage(), configurable: true });
    Object.defineProperty(window, "sessionStorage", { value: makeStorage(), configurable: true });
  } catch (e) {}
})();
<\/script>`;

export function buildPreview(
  files: Record<string, string>,
  appUrl: string,
  showBadge: boolean = true
): PreviewResult {
  const unsupported = unsupportedReason(files, "preview");
  if (unsupported) return { kind: "unsupported", reason: unsupported };

  const htmlEntry = findHtmlEntry(files);

  // Plain static site: use it directly.
  if (htmlEntry && isStandaloneHtml(files[htmlEntry])) {
    let doc = files[htmlEntry];
    // Must land before any of the page's own scripts run, so inject right
    // after <head> opens rather than at </head> like the stylesheet below.
    doc = doc.includes("<head>")
      ? doc.replace("<head>", `<head>${STORAGE_POLYFILL}`)
      : `${STORAGE_POLYFILL}${doc}`;
    const css = collectCss(files);
    if (css && doc.includes("</head>")) {
      doc = doc.replace("</head>", `<style>${css}</style></head>`);
    }
    if (showBadge) {
      const badge = watermarkSnippet(appUrl);
      doc = doc.includes("</body>")
        ? doc.replace("</body>", `${badge}</body>`)
        : `${doc}${badge}`;
    }
    return { kind: "html", doc };
  }

  const entry = findScriptEntry(files);
  if (!entry) {
    return {
      kind: "unsupported",
      reason: "This project has no HTML page or front-end entry file to preview.",
    };
  }

  const sources: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (SCRIPT_EXT.test(path) || path.endsWith(".css") || path.endsWith(".json")) {
      sources[path] = content;
    }
  }

  const css = collectCss(files);
  const badge = showBadge ? watermarkSnippet(appUrl) : "";

  // The loader below runs inside the iframe. It transpiles each module on
  // demand, rewrites relative imports to blob URLs, and caches by path.
  const doc = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${STORAGE_POLYFILL}
<script src="https://cdn.jsdelivr.net/npm/@babel/standalone@7/babel.min.js"><\/script>
<script src="https://cdn.tailwindcss.com"><\/script>
<style>${css}</style>
<style>body{margin:0}#feather-preview-error{position:fixed;inset:0;padding:24px;background:#0a0a0a;color:#f87171;font:13px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;overflow:auto}</style>
</head>
<body>
<div id="root"></div>
<script>
const SOURCES = ${JSON.stringify(sources)};
const ENTRY = ${JSON.stringify(entry)};
const CDN = "https://esm.sh/";

function fail(message) {
  const el = document.createElement("pre");
  el.id = "feather-preview-error";
  el.textContent = "Preview error\\n\\n" + message;
  document.body.appendChild(el);
}

function dirname(p) { const i = p.lastIndexOf("/"); return i === -1 ? "" : p.slice(0, i); }

function normalize(p) {
  const parts = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

function resolve(spec, importer) {
  // The "@/..." alias is the common Vite/shadcn convention for "rooted at
  // src/", independent of the importing file's own location.
  const base = spec.startsWith("@/")
    ? normalize("src/" + spec.slice(2))
    : normalize(dirname(importer) + "/" + spec);
  const candidates = [base, base + ".tsx", base + ".ts", base + ".jsx", base + ".js",
                      base + "/index.tsx", base + "/index.ts", base + "/index.jsx", base + "/index.js"];
  return candidates.find((c) => SOURCES[c] !== undefined);
}

const cache = new Map();

function toBlobUrl(path) {
  if (cache.has(path)) return cache.get(path);
  const source = SOURCES[path];
  if (source === undefined) throw new Error("Missing module: " + path);

  if (path.endsWith(".css")) {
    const url = URL.createObjectURL(new Blob(["export default {}"], { type: "text/javascript" }));
    cache.set(path, url);
    return url;
  }
  if (path.endsWith(".json")) {
    const url = URL.createObjectURL(
      new Blob(["export default " + source], { type: "text/javascript" })
    );
    cache.set(path, url);
    return url;
  }

  let code;
  try {
    code = Babel.transform(source, {
      presets: [
        ["typescript", { isTSX: true, allExtensions: true }],
        ["react", { runtime: "automatic" }],
      ],
      filename: path,
    }).code;
  } catch (e) {
    throw new Error("Failed to compile " + path + "\\n" + e.message);
  }

  // Rewrite every import/export specifier: relative paths become blob URLs,
  // bare package names go to the CDN.
  code = code.replace(
    /(\\bfrom\\s*|\\bimport\\s*\\(?\\s*)(["'])([^"']+)\\2/g,
    (match, prefix, quote, spec) => {
      if (spec.startsWith(".") || spec.startsWith("@/")) {
        const target = resolve(spec, path);
        if (!target) return prefix + quote + spec + quote;
        return prefix + quote + toBlobUrl(target) + quote;
      }
      if (spec.startsWith("http")) return match;
      return prefix + quote + CDN + spec + quote;
    }
  );

  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  cache.set(path, url);
  return url;
}

window.addEventListener("error", (e) => fail(e.message));
window.addEventListener("unhandledrejection", (e) => fail(String(e.reason)));

try {
  const entryUrl = toBlobUrl(ENTRY);
  const isComponentEntry = /App\\.(tsx|jsx)$/.test(ENTRY);
  const boot = isComponentEntry
    ? 'import React from "' + CDN + 'react";' +
      'import { createRoot } from "' + CDN + 'react-dom/client";' +
      'import App from "' + entryUrl + '";' +
      'createRoot(document.getElementById("root")).render(React.createElement(App));'
    : 'import "' + entryUrl + '";';
  const script = document.createElement("script");
  script.type = "module";
  script.textContent = boot;
  document.body.appendChild(script);
} catch (e) {
  fail(e.message);
}
<\/script>
${badge}
</body>
</html>`;

  return { kind: "html", doc };
}
