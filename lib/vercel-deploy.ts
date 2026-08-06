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
 * Best-effort build log tail for a deployment that failed, so the failure
 * message can show what actually went wrong instead of just "check Vercel
 * directly." Never throws — a failure to fetch logs must never mask the
 * real deploy failure it's trying to explain.
 *
 * Vercel's events endpoint returns a proper JSON array for some query
 * shapes and newline-delimited JSON for others; handled defensively here
 * since this has no live environment to verify the exact response shape
 * against ahead of time.
 */
async function getDeploymentBuildLogs(deploymentId: string, limit = 300): Promise<string[]> {
  try {
    const res = await vercelFetch(
      withTeam(`/v3/deployments/${encodeURIComponent(deploymentId)}/events`, { builds: 1, limit })
    );
    if (!res.ok) return [];

    let events: any[] = [];
    if (Array.isArray(res.body)) {
      events = res.body;
    } else if (typeof res.body === "string") {
      events = res.body
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter((e): e is Record<string, unknown> => e !== null);
    }

    return events
      .map((e) => (e?.payload && typeof e.payload.text === "string" ? (e.payload.text as string) : null))
      .filter((line): line is string => Boolean(line && line.trim()));
  } catch {
    return [];
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

  // Forcing the "vite" framework unconditionally used to be safe (every
  // deploy was a Vite frontend), but lib/express-adapter.ts can now produce
  // a backend-only deploy (no index.html/vite.config at all) — telling
  // Vercel to run a Vite build against that would just fail outright, so
  // only claim "vite" when there's actually a frontend to build.
  const hasFrontend = Object.keys(files).some(
    (f) => /(^|\/)index\.html$/i.test(f) || /vite\.config\.[jt]s$/i.test(f)
  );

  const created = await vercelFetch(`/v13/deployments${scopeQuery()}`, {
    method: "POST",
    body: JSON.stringify({
      name: slug,
      target: "production",
      ...(hasFrontend ? { projectSettings: { framework: "vite" } } : {}),
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
    const inspectorUrl = typeof check.body.inspectorUrl === "string" ? check.body.inspectorUrl : null;
    if (state === "READY") {
      const customAlias = await tryCustomAlias(id, slug);
      return { url: `https://${customAlias ?? url}`, id };
    }
    if (state === "ERROR" || state === "CANCELED") {
      const canceled = state === "CANCELED";
      const logLines = canceled ? [] : await getDeploymentBuildLogs(id);
      const tail = logLines.slice(-40).join("\n");
      // The events endpoint above is best-effort and can come back empty
      // even for a real build failure (a query-shape mismatch, an events
      // page that hasn't landed yet) — a direct link to this exact
      // deployment's own logs on Vercel is a real fallback either way,
      // not just "check Vercel" with nothing to click.
      const logsLine = inspectorUrl ? `\n\nFull logs: ${inspectorUrl}` : "";
      const fallbackTail = "Download the ZIP to see the full error on Vercel, or check that the app builds locally with npm run build.";
      const message = tail
        ? `The deployment failed to build. Build output:\n\n${tail}${logsLine}`
        : `The deployment failed to build${canceled ? " (canceled)" : ""}. ${logsLine ? `Full logs: ${inspectorUrl}` : fallbackTail}`;
      throw new Error(message);
    }
  }

  throw new Error("The deployment is taking longer than expected. Check its status on Vercel directly.");
}

export interface DomainVerificationRecord {
  type: string;
  domain: string;
  value: string;
  reason: string;
}

export interface DomainStatus {
  name: string;
  verified: boolean;
  verification?: DomainVerificationRecord[];
}

/**
 * The Vercel project name a deployed app actually lives in. deployToVercel
 * names the project after a slug computed from the app's name at deploy
 * time — but the app's name can change later (a refine can rename it), so
 * re-deriving that slug after the fact could land on a different project
 * than the one that's actually live. Reading it back out of the deployed
 * URL's own hostname is what the app is really running on right now,
 * regardless of what it's since been renamed to.
 */
export function projectSlugFromDeployedUrl(deployedUrl: string): string | null {
  try {
    return new URL(deployedUrl).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

/**
 * Attaches a custom domain to the Vercel project a specific app is
 * deployed to. Returns Vercel's verification requirement (a DNS record to
 * add) when the domain isn't already verified — which is the normal case
 * for a domain nobody's pointed at Vercel yet.
 */
export async function addProjectDomain(projectSlug: string, domain: string): Promise<DomainStatus> {
  const res = await vercelFetch(`/v10/projects/${encodeURIComponent(projectSlug)}/domains${scopeQuery()}`, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  });
  if (!res.ok) {
    throw new Error(res.body?.error?.message || res.body?.message || "Couldn't add that domain.");
  }
  return { name: res.body.name, verified: Boolean(res.body.verified), verification: res.body.verification };
}

/** Re-checks a domain already attached to the project, e.g. after the caller has added the DNS record. */
export async function getProjectDomainStatus(projectSlug: string, domain: string): Promise<DomainStatus> {
  const res = await vercelFetch(
    `/v9/projects/${encodeURIComponent(projectSlug)}/domains/${encodeURIComponent(domain)}${scopeQuery()}`
  );
  if (!res.ok) {
    throw new Error(res.body?.error?.message || res.body?.message || "Couldn't check that domain's status.");
  }
  return { name: res.body.name, verified: Boolean(res.body.verified), verification: res.body.verification };
}

export async function removeProjectDomain(projectSlug: string, domain: string): Promise<void> {
  const res = await vercelFetch(
    `/v9/projects/${encodeURIComponent(projectSlug)}/domains/${encodeURIComponent(domain)}${scopeQuery()}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    throw new Error(res.body?.error?.message || res.body?.message || "Couldn't remove that domain.");
  }
}

function withTeam(path: string, params: Record<string, string | number | undefined> = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) sp.set(k, String(v));
  }
  if (process.env.VERCEL_TEAM_ID) sp.set("teamId", process.env.VERCEL_TEAM_ID);
  const qs = sp.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Registrar (buy-a-domain) contact — Vercel requires the full set on purchase, none of it optional. */
export interface DomainContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  companyName?: string;
}

export async function checkDomainAvailability(domain: string): Promise<boolean> {
  const res = await vercelFetch(withTeam(`/v1/registrar/domains/${encodeURIComponent(domain)}/availability`));
  if (!res.ok) {
    throw new Error(res.body?.error?.message || res.body?.message || "Couldn't check that domain's availability.");
  }
  return Boolean(res.body.available);
}

/** Vercel's own registrar price (wholesale), before Breezify's markup — see markedUpDomainPrice() in lib/types.ts. */
export async function getDomainPrice(domain: string, years = 1): Promise<{ years: number; purchasePrice: number }> {
  const res = await vercelFetch(withTeam(`/v1/registrar/domains/${encodeURIComponent(domain)}/price`, { years }));
  if (!res.ok) {
    throw new Error(res.body?.error?.message || res.body?.message || "Couldn't price that domain.");
  }
  const price = Number(res.body.purchasePrice);
  if (!Number.isFinite(price)) {
    throw new Error("Vercel didn't return a usable price for that domain.");
  }
  return { years: res.body.years ?? years, purchasePrice: price };
}

/**
 * Registers a domain through Vercel's registrar. `expectedPrice` must match
 * Vercel's own current price (from getDomainPrice, in Vercel's wholesale
 * terms, NOT whatever Breezify charged the customer) — Vercel rejects the
 * order if it's drifted. Purchase is asynchronous: this returns an order ID
 * to poll via getDomainOrderStatus, not a confirmed registration.
 */
export async function purchaseDomainOnVercel(
  domain: string,
  years: number,
  expectedPrice: number,
  contact: DomainContact,
  autoRenew: boolean
): Promise<string> {
  const res = await vercelFetch(withTeam(`/v1/registrar/domains/${encodeURIComponent(domain)}/buy`), {
    method: "POST",
    body: JSON.stringify({
      autoRenew,
      years,
      expectedPrice,
      contactInformation: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        address1: contact.address1,
        address2: contact.address2,
        city: contact.city,
        state: contact.state,
        zip: contact.zip,
        country: contact.country,
        companyName: contact.companyName,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(res.body?.error?.message || res.body?.message || "Couldn't purchase that domain.");
  }
  const orderId = res.body.orderId as string | undefined;
  if (!orderId) {
    throw new Error("Vercel didn't return an order ID for the purchase.");
  }
  return orderId;
}

export interface DomainOrderStatus {
  status: "draft" | "purchasing" | "completed" | "failed";
  error?: string;
}

export async function getDomainOrderStatus(orderId: string): Promise<DomainOrderStatus> {
  const res = await vercelFetch(withTeam(`/v1/registrar/orders/${encodeURIComponent(orderId)}`));
  if (!res.ok) {
    throw new Error(res.body?.error?.message || res.body?.message || "Couldn't check that order's status.");
  }
  const firstDomainError = Array.isArray(res.body.domains) ? res.body.domains[0]?.error : undefined;
  return {
    status: res.body.status,
    error: firstDomainError ? String(firstDomainError) : res.body.error?.message,
  };
}

/**
 * Polls a Vercel registrar order until it lands on a terminal state. Shared
 * by app/api/stripe/webhook (original purchases) and
 * app/api/cron/renew-domains (renewals) — both buy through
 * purchaseDomainOnVercel() and need the same follow-up.
 *
 * Deliberately doesn't treat "still not done after the deadline" as a
 * failure: at that point money has moved and the order may still be in
 * flight, so throwing (rather than refunding) is what lets a caller retry
 * later instead of assuming it failed — see each caller's own resume/retry
 * logic for how it acts on that.
 */
export async function pollDomainOrder(orderId: string, deadlineMs = 45_000): Promise<void> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const order = await getDomainOrderStatus(orderId);
    if (order.status === "completed") return;
    if (order.status === "failed") {
      throw new Error(order.error || "Vercel couldn't complete the domain registration.");
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Domain order ${orderId} is still pending after the poll window; will retry later.`);
}
