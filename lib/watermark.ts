/**
 * "Built with Breezify" badge injected into generated apps.
 *
 * Applied at export time (preview, ZIP download, GitHub push) rather than
 * stored in the app's files, so the code you see in the editor stays clean
 * and the badge can be updated without regenerating anything.
 */

import { getAppBaseUrl } from "@/lib/app-base-url";

const BADGE_ID = "breezify-badge";

export function watermarkSnippet(appUrl: string) {
  // Inline styles and a shadow-free absolute element keep this from colliding
  // with whatever CSS the generated app ships.
  return `<!-- Built with Breezify -->
<a id="${BADGE_ID}" href="${appUrl}" target="_blank" rel="noopener noreferrer"
   style="position:fixed;right:16px;bottom:16px;z-index:2147483000;display:inline-flex;align-items:center;gap:7px;padding:7px 12px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(10,10,10,.88);color:#fafafa;font:500 12px/1 ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;text-decoration:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 2px 12px rgba(0,0,0,.35);transition:opacity .15s ease"
   onmouseover="this.style.opacity='.82'" onmouseout="this.style.opacity='1'">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M4 7c2-2 4 2 6 0s4 2 6 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M2 12c3-3 6 3 9 0s6 3 9 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M4 17c2-2 4 2 6 0s4 2 6 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
  </svg>
  Built with Breezify
</a>`;
}

/**
 * Returns a copy of the file set with the badge added to every HTML entry
 * point. Files without an HTML document are returned untouched. Paid plans
 * pass `show: false` to export clean, badge-free code.
 */
export function withWatermark(
  files: Record<string, string>,
  show: boolean = true
): Record<string, string> {
  if (!show) return files;
  const snippet = watermarkSnippet(getAppBaseUrl());
  const out: Record<string, string> = { ...files };
  let injected = false;

  for (const [path, content] of Object.entries(files)) {
    if (!path.toLowerCase().endsWith(".html")) continue;
    if (content.includes(BADGE_ID)) {
      injected = true;
      continue;
    }
    if (content.includes("</body>")) {
      out[path] = content.replace("</body>", `${snippet}\n</body>`);
    } else {
      out[path] = `${content}\n${snippet}\n`;
    }
    injected = true;
  }

  // Nothing to attach the badge to; leave the project alone rather than
  // inventing an HTML file the build doesn't expect.
  if (!injected) return files;
  return out;
}
