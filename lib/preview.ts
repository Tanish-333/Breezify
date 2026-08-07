import { watermarkSnippet } from "@/lib/watermark";
import { unsupportedReason } from "@/lib/app-support";
import { FIREBASE_PUBLIC_CONFIG } from "@/lib/firebase-public-config";

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
 * A small dismissible banner shown when the app has api/ backend routes:
 * those only run once deployed (no server behind this in-browser preview to
 * call them), but the rest of the app — every page, every piece of UI —
 * still works and is worth seeing rather than replacing the whole preview
 * with a blocking "can't preview this" message.
 */
function apiRoutesBanner() {
  return `<div id="feather-api-banner" style="position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;background:#1e293b;color:#e2e8f0;font:12px/1.4 ui-sans-serif,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.3)">
<span style="flex:1">This app's backend (api/) routes only run once deployed — the rest of the app previews normally.</span>
<button onclick="this.parentElement.remove()" style="background:none;border:none;color:inherit;font-size:14px;line-height:1;cursor:pointer;padding:0 2px">&times;</button>
</div>`;
}

export function hasApiRoutes(files: Record<string, string>) {
  return Object.keys(files).some((p) => /^api\//i.test(p));
}

// IDs of Breezify's own injected elements (the watermark badge, the api/
// banner above) — never selectable for editing, same reasoning as the
// isEligible() checks below excluding script/style/html/body.
const NON_EDITABLE_IDS = ["breezify-badge", "feather-api-banner"];

/**
 * Appends the click-to-edit script the Visual tab uses (components/
 * app-visual-editor.tsx) onto an already-built preview document — kept
 * fully separate from buildPreview() above rather than threading a flag
 * through its two branches, since this only ever needs to run for the one
 * caller that wants it. Reports the clicked element back to the parent via
 * postMessage, the exact same sandboxed-iframe pattern buildPreview's own
 * runtime-error reporting already uses (see the `fail()` function above) —
 * the iframe has no allow-same-origin, so postMessage is the only channel
 * across that boundary either way.
 *
 * Capture-phase listeners intercept a click before the app's own handlers
 * ever see it, and preventDefault/stopPropagation stop it from also
 * navigating a link or submitting a form while in edit mode — the click is
 * "select this element to edit," not "activate it."
 */
export function withVisualEditing(doc: string): string {
  const script = `<script>
(function () {
  if (window.__breezifyVisualEdit) return;
  window.__breezifyVisualEdit = true;

  var NON_EDITABLE_IDS = ${JSON.stringify(NON_EDITABLE_IDS)};
  var SKIP_TAGS = ["SCRIPT", "STYLE", "LINK", "META", "HTML", "BODY"];

  var overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #3b82f6;" +
    "background:rgba(59,130,246,.08);display:none;box-sizing:border-box;";
  document.documentElement.appendChild(overlay);

  function isNonEditable(el) {
    for (var i = 0; i < NON_EDITABLE_IDS.length; i++) {
      if (el.id === NON_EDITABLE_IDS[i] || (el.closest && el.closest("#" + NON_EDITABLE_IDS[i]))) return true;
    }
    return false;
  }

  function isEligible(el) {
    if (!el || el.nodeType !== 1 || el === document.body || el === document.documentElement) return false;
    if (SKIP_TAGS.indexOf(el.tagName) !== -1) return false;
    if (isNonEditable(el)) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function selectorFor(el) {
    if (el.id) return "#" + el.id;
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      var parent = node.parentElement;
      if (!parent) {
        parts.unshift(node.tagName.toLowerCase());
        break;
      }
      var siblings = Array.prototype.filter.call(parent.children, function (c) {
        return c.tagName === node.tagName;
      });
      var index = siblings.indexOf(node) + 1;
      parts.unshift(node.tagName.toLowerCase() + (siblings.length > 1 ? ":nth-of-type(" + index + ")" : ""));
      node = parent;
    }
    return parts.join(" > ");
  }

  // Only this element's OWN text, not its children's — clicking a card with
  // a heading and a paragraph inside should edit the card, not concatenate
  // text that visually belongs to two different elements.
  function directText(el) {
    var text = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      var n = el.childNodes[i];
      if (n.nodeType === 3) text += n.textContent;
    }
    return text.trim();
  }

  document.addEventListener(
    "mouseover",
    function (e) {
      if (!isEligible(e.target)) {
        overlay.style.display = "none";
        return;
      }
      var r = e.target.getBoundingClientRect();
      overlay.style.display = "block";
      overlay.style.left = r.left + "px";
      overlay.style.top = r.top + "px";
      overlay.style.width = r.width + "px";
      overlay.style.height = r.height + "px";
    },
    true
  );

  document.addEventListener(
    "click",
    function (e) {
      var el = e.target;
      if (!isEligible(el)) return;
      e.preventDefault();
      e.stopPropagation();
      var r = el.getBoundingClientRect();
      var cs = window.getComputedStyle(el);
      try {
        window.parent.postMessage(
          {
            source: "breezify-preview",
            type: "element-click",
            selector: selectorFor(el),
            tag: el.tagName.toLowerCase(),
            text: directText(el),
            rect: { x: r.left, y: r.top, width: r.width, height: r.height },
            styles: {
              color: cs.color,
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              padding: cs.padding,
            },
          },
          "*"
        );
      } catch (err) {}
    },
    true
  );
})();
<\/script>`;

  return doc.includes("</body>") ? doc.replace("</body>", `${script}</body>`) : `${doc}${script}`;
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

/**
 * Despite the system prompt telling the model to inline FIREBASE_API_KEY as
 * a literal (see lib/generation/prompt.ts), models still default to reading
 * it — or any other config value — via `import.meta.env.VITE_*`, a Vite-only
 * convention that doesn't exist in this no-build-step preview and throws
 * "Cannot read properties of undefined" the instant the module runs. Since
 * that habit can't be fully prompted away, this shim covers it at runtime
 * too: `import.meta.env` is rewritten (see toBlobUrl below) to a real object
 * populated with Breezify's own public Firebase config under every common
 * env-var naming convention, so the common case resolves to a working value
 * instead of just failing to throw. Any other made-up key still resolves to
 * `undefined` (a plain object, not a crash) rather than the hard crash a
 * missing `import.meta.env` itself causes.
 */
function envShimScript() {
  const c = FIREBASE_PUBLIC_CONFIG;
  const entries = (prefix: string) => ({
    [`${prefix}FIREBASE_API_KEY`]: c.apiKey,
    [`${prefix}FIREBASE_AUTH_DOMAIN`]: c.authDomain,
    [`${prefix}FIREBASE_PROJECT_ID`]: c.projectId,
    [`${prefix}FIREBASE_STORAGE_BUCKET`]: c.storageBucket,
    [`${prefix}FIREBASE_MESSAGING_SENDER_ID`]: c.messagingSenderId,
    [`${prefix}FIREBASE_APP_ID`]: c.appId,
  });
  const env = { ...entries("VITE_"), ...entries("REACT_APP_"), ...entries("NEXT_PUBLIC_"), MODE: "production", DEV: false, PROD: true };
  return `<script>
window.__BREEZIFY_ENV__ = ${JSON.stringify(env)};
window.process = window.process || { env: window.__BREEZIFY_ENV__ };
<\/script>`;
}

export function buildPreview(
  files: Record<string, string>,
  appUrl: string,
  showBadge: boolean = true
): PreviewResult {
  const unsupported = unsupportedReason(files, "preview");
  if (unsupported) return { kind: "unsupported", reason: unsupported };

  const htmlEntry = findHtmlEntry(files);
  const apiBanner = hasApiRoutes(files) ? apiRoutesBanner() : "";

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
    if (apiBanner) {
      doc = doc.includes("</body>") ? doc.replace("</body>", `${apiBanner}</body>`) : `${doc}${apiBanner}`;
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

  // esm.sh serves whatever it considers "latest" for an unversioned bare
  // import — that drifts out from under us over time (e.g. lucide-react
  // dropped several brand icons like Github/Twitter/Instagram in newer
  // releases than the one every template/generated app was actually built
  // against), silently crashing a preview that imports one. Pinning every
  // bare import to the version actually declared in the app's own
  // package.json keeps the preview matching what the code was written for.
  let depVersions: Record<string, string> = {};
  try {
    const pkg = JSON.parse(files["package.json"] ?? "{}");
    depVersions = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch {
    // No package.json, or it doesn't parse — fall back to unpinned esm.sh
    // resolution below, same as before this existed.
  }

  // The loader below runs inside the iframe. It transpiles each module on
  // demand, rewrites relative imports to blob URLs, and caches by path.
  const doc = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${STORAGE_POLYFILL}
${envShimScript()}
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
const DEP_VERSIONS = ${JSON.stringify(depVersions)};
const CDN = "https://esm.sh/";

// Pins a bare import ("lucide-react", "@radix-ui/react-dialog/x") to the
// exact version declared in the app's package.json, when there is one —
// see this function's doc comment above where depVersions is built.
function pinnedSpec(spec) {
  const scoped = spec.charAt(0) === "@";
  const parts = spec.split("/");
  const name = scoped ? parts.slice(0, 2).join("/") : parts[0];
  const subpath = spec.slice(name.length);
  const range = DEP_VERSIONS[name];
  if (!range) return spec;
  const match = String(range).match(/\\d[\\d.]*/);
  if (!match) return spec;
  return name + "@" + match[0] + subpath;
}

function fail(message) {
  const el = document.createElement("pre");
  el.id = "feather-preview-error";
  el.textContent = "Preview error\\n\\n" + message;
  document.body.appendChild(el);
  // Sandbox omits allow-same-origin (see AppPreview's own comment on why),
  // so the parent page can't read this iframe's DOM directly — postMessage
  // is the one channel that still works across an opaque-origin boundary,
  // and is what lets the parent offer a one-click "Fix this error" refine.
  try {
    window.parent.postMessage({ source: "breezify-preview", type: "error", message: message }, "*");
  } catch (e) {}
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

  // import.meta.env doesn't exist without a real Vite build (see
  // envShimScript's own comment on why the model reaches for it anyway) —
  // import.meta itself can't be monkey-patched from outside since it's a
  // read-only per-module binding, so this rewrites the text instead, same
  // trick as the import-specifier rewrite below.
  code = code.replace(/import\\.meta\\.env/g, "window.__BREEZIFY_ENV__");

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
      return prefix + quote + CDN + pinnedSpec(spec) + quote;
    }
  );

  const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  cache.set(path, url);
  return url;
}

window.addEventListener("error", (e) => {
  // e.message is sometimes empty for module-script errors even inside this
  // same sandboxed frame (no separate origin actually crossed, but some
  // browsers still apply the cross-origin-script message redaction to any
  // blob: URL module) — previously this just showed "Uncaught" with
  // nothing after it. Fall back to whatever else the event actually has.
  const parts = [];
  if (e.message) parts.push(e.message);
  if (e.error && e.error.stack) parts.push(String(e.error.stack));
  if (!parts.length && e.filename) parts.push("at " + e.filename + ":" + e.lineno + ":" + e.colno);
  fail(parts.length ? parts.join("\\n\\n") : "An unknown error occurred with no further detail available (this can happen with certain module-loading errors).");
});
window.addEventListener("unhandledrejection", (e) => {
  const reason = e.reason;
  const message =
    reason instanceof Error
      ? (reason.stack || reason.message)
      : String(reason);
  fail(message);
});

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
${apiBanner}
</body>
</html>`;

  return { kind: "html", doc };
}
