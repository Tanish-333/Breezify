// Minimal Vercel REST client for deploying a generated app's files directly,
// with no local build step or CLI involved. Requires VERCEL_TOKEN (a
// personal or team API token from https://vercel.com/account/tokens);
// VERCEL_TEAM_ID is only needed when that token belongs to a team account.

const VERCEL_API = "https://api.vercel.com";

export function isDeployConfigured() {
  return Boolean(process.env.VERCEL_TOKEN);
}

function scopeQuery() {
  return process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : "";
}

async function vercelFetch(path: string, init?: RequestInit) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error(
      "Deploys aren't configured on this deployment yet. Set VERCEL_TOKEN to enable them."
    );
  }
  const res = await fetch(`${VERCEL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON error bodies are rare but possible; keep the raw text.
  }
  return { ok: res.ok, status: res.status, body };
}

export interface DeployResult {
  url: string;
  id: string;
}

/**
 * Aliases a finished deployment to `{slug}.DEPLOY_DOMAIN`, e.g.
 * my-app.feather123.app instead of a *.vercel.app URL. Only attempted when
 * DEPLOY_DOMAIN is set, and the domain must already be added and verified
 * on the Vercel project/team for this to succeed. Best-effort: any failure
 * (domain not configured yet, not verified, network error) is swallowed and
 * logged, and the deploy falls back to its default *.vercel.app URL rather
 * than failing outright.
 */
async function tryCustomAlias(deploymentId: string, slug: string): Promise<string | null> {
  const domain = process.env.DEPLOY_DOMAIN;
  if (!domain) return null;
  const alias = `${slug}.${domain}`;
  try {
    const res = await vercelFetch(`/v2/deployments/${deploymentId}/aliases${scopeQuery()}`, {
      method: "POST",
      body: JSON.stringify({ alias }),
    });
    if (!res.ok) {
      console.warn(
        `[vercel-deploy] Couldn't alias to ${alias}:`,
        res.body?.error?.message || res.body?.message
      );
      return null;
    }
    return alias;
  } catch (err) {
    console.warn(`[vercel-deploy] Couldn't alias to ${alias}:`, err);
    return null;
  }
}

/**
 * Creates a deployment from raw file contents (no git repo, no CLI) and
 * polls until Vercel finishes building it. Vercel auto-creates the project
 * (named after `slug`) on first deploy and reuses it on every later one, so
 * repeat deploys of the same app land on the same project and, once it's
 * had a first successful deploy, the same *.vercel.app URL.
 */
export async function deployToVercel(
  slug: string,
  files: Record<string, string>,
  onStatus?: (message: string) => void,
  env?: Record<string, string>
): Promise<DeployResult> {
  onStatus?.("Uploading files");

  const created = await vercelFetch(`/v13/deployments${scopeQuery()}`, {
    method: "POST",
    body: JSON.stringify({
      name: slug,
      target: "production",
      projectSettings: { framework: "vite" },
      files: Object.entries(files).map(([file, data]) => ({
        file: file.replace(/^\/+/, ""),
        data,
      })),
      // Only the app's own api/ serverless functions ever see these (a
      // static Vite build has no server-side code to read process.env at
      // all), populated from that app's Secrets panel (see
      // app/api/deploy/route.ts). Skipped entirely when there are none.
      ...(env && Object.keys(env).length > 0
        ? { env, build: { env } }
        : {}),
    }),
  });

  if (!created.ok) {
    throw new Error(created.body?.error?.message || created.body?.message || "Couldn't start the deployment.");
  }

  const id = created.body.id as string;
  let url = created.body.url as string;

  onStatus?.("Building");

  // Vercel builds asynchronously; poll until it's ready or fails. A typical
  // Vite build takes well under a minute, but give it real headroom.
  const deadline = Date.now() + 110_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const check = await vercelFetch(`/v13/deployments/${id}${scopeQuery()}`);
    if (!check.ok) continue;
    const state = check.body.readyState as string;
    url = check.body.url ?? url;
    if (state === "READY") {
      const customAlias = await tryCustomAlias(id, slug);
      return { url: `https://${customAlias ?? url}`, id };
    }
    if (state === "ERROR" || state === "CANCELED") {
      throw new Error(
        `The deployment failed to build${state === "CANCELED" ? " (canceled)" : ""}. Download the ZIP to see the full error on Vercel, or check that the app builds locally with \`npm run build\`.`
      );
    }
  }

  throw new Error("The deployment is taking longer than expected. Check its status on Vercel directly.");
}
