/**
 * Deployed-app visit tracking + free-tier traffic-cap enforcement. A tiny
 * beacon is injected into every deployed app's HTML that pings /api/track
 * once per page load. That route increments the app's view counters (see
 * lib/traffic-guard.ts) and reports back whether the app is currently over
 * its plan's MONTHLY_PAGE_VIEW_LIMIT — if so, the visitor is redirected to
 * /limit-reached instead of seeing the app.
 *
 * The lifetime `visits` increment is safe for an unauthenticated caller
 * because firestore.rules restricts that public fallback write to exactly
 * +1 on "visits" and nothing else (see the apps/{appId} update rule); the
 * richer monthly-window bookkeeping happens server-side via the Admin SDK
 * when it's configured (see lib/traffic-guard.ts).
 */

const SNIPPET_ID = "breezify-analytics";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://breezify.vercel.app";
}

export function analyticsSnippet(appId: string) {
  const trackUrl = `${appUrl()}/api/track`;
  const limitBase = `${appUrl()}/limit-reached?app=${encodeURIComponent(appId)}`;
  return `<script id="${SNIPPET_ID}">(function(){try{fetch(${JSON.stringify(
    trackUrl
  )},{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:JSON.stringify({appId:${JSON.stringify(
    appId
  )},path:location.pathname})}).then(function(r){return r.json();}).then(function(d){if(d&&d.blocked){window.location.replace(${JSON.stringify(
    limitBase
  )}+"&reason="+encodeURIComponent(d.reason||"traffic"));}}).catch(function(){});}catch(e){}})();</script>`;
}

/**
 * Returns a copy of the file set with the tracking snippet added to every
 * HTML entry point.
 */
export function withAnalytics(files: Record<string, string>, appId: string): Record<string, string> {
  const snippet = analyticsSnippet(appId);
  const out: Record<string, string> = { ...files };
  let injected = false;

  for (const [path, content] of Object.entries(files)) {
    if (!path.toLowerCase().endsWith(".html")) continue;
    if (content.includes(SNIPPET_ID)) {
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

  if (!injected) return files;
  return out;
}
