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
 * Creates a deployment from raw file contents (no git repo, no CLI) and
 * polls until Vercel finishes building it. Vercel auto-creates the project
 * (named after `slug`) on first deploy and reuses it on every later one, so
 * repeat deploys of the same app land on the same project and, once it's
 * had a first successful deploy, the same *.vercel.app URL.
 */
export async function deployToVercel(
  slug: string,
  files: Record<string, string>,
  onStatus?: (message: string) => void
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
      return { url: `https://${url}`, id };
    }
    if (state === "ERROR" || state === "CANCELED") {
      throw new Error(
        `The deployment failed to build${state === "CANCELED" ? " (canceled)" : ""}. Download the ZIP to see the full error on Vercel, or check that the app builds locally with \`npm run build\`.`
      );
    }
  }

  throw new Error("The deployment is taking longer than expected. Check its status on Vercel directly.");
}
