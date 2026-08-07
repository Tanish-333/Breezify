/**
 * Deployed-app visit tracking, Pro+ only. A tiny fire-and-forget beacon is
 * injected into the deployed HTML that pings /api/track once per page
 * load. That route does an unauthenticated Firestore increment on
 * apps/{appId}.visits, safe because firestore.rules restricts that
 * specific public write to exactly +1 on the "visits" field and nothing
 * else (see the apps/{appId} update rule). This is a simple page-load
 * counter, not unique-visitor analytics, and since the endpoint is public
 * by design (like any real analytics beacon), the count can be inflated
 * by anyone who scripts requests against it directly.
 */

const SNIPPET_ID = "breezify-analytics";

function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://breezify.dev";
}

export function analyticsSnippet(appId: string) {
  return `<script id="${SNIPPET_ID}">(function(){try{fetch(${JSON.stringify(
    `${appUrl()}/api/track`
  )},{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({appId:${JSON.stringify(
    appId
  )}}),keepalive:true}).catch(function(){});}catch(e){}})();</script>`;
}

/**
 * Returns a copy of the file set with the tracking snippet added to every
 * HTML entry point. No-op unless `enabled`, so this stays entirely inert
 * on plans that don't get analytics.
 */
export function withAnalytics(
  files: Record<string, string>,
  appId: string,
  enabled: boolean
): Record<string, string> {
  if (!enabled) return files;
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
