// Minimal transactional email client, talking to Resend's REST API directly
// via fetch — no extra SDK dependency, same pattern as lib/vercel-deploy.ts
// and the Groq provider. Needs RESEND_API_KEY set; every caller treats
// sending as best-effort (see isEmailConfigured()), so a deployment without
// it configured just skips the email rather than failing whatever
// triggered it.

const RESEND_API = "https://api.resend.com/emails";

export function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

function fromAddress() {
  // *.vercel.app is a Vercel-owned domain — there's no DNS access to add the
  // TXT/CNAME records Resend needs to verify it, so a from-address on it can
  // never send (Resend rejects unverified senders outright). Falls back to
  // Resend's own onboarding@resend.dev, which sends out of the box with zero
  // setup; set RESEND_FROM_EMAIL once a real domain is verified in Resend.
  return process.env.RESEND_FROM_EMAIL || "Breezify <onboarding@resend.dev>";
}

/**
 * Sends a transactional email. Throws on failure — callers that consider
 * email a nice-to-have (most of them) should catch and log rather than let
 * it fail the request that triggered it; see sendCollaboratorInviteEmail
 * for the pattern.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  if (!isEmailConfigured()) return;
  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress(), to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to send email (${res.status}): ${body}`);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function emailShell(bodyHtml: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#18181b">
${bodyHtml}
<p style="margin-top:32px;font-size:12px;color:#71717a">Sent by Breezify — the AI app builder.</p>
</div>`;
}

/** Notifies an invited collaborator they've been given access to an app — see app/api/apps/[appId]/collaborators. */
export async function sendCollaboratorInviteEmail(params: {
  to: string;
  appName: string;
  appId: string;
  appUrl: string;
}): Promise<void> {
  const { to, appName, appId, appUrl } = params;
  const link = `${appUrl}/build/${appId}`;
  const safeName = escapeHtml(appName || "an app");
  await sendEmail({
    to,
    subject: `You've been invited to work on "${appName || "an app"}" on Breezify`,
    html: emailShell(`
<h2 style="font-size:18px;margin:0 0 12px">You're now a collaborator</h2>
<p style="font-size:14px;line-height:1.6;margin:0 0 20px">
  You've been added as a collaborator on <strong>${safeName}</strong>. You can view its files,
  refine it, and deploy it using your own Breezify plan and credits.
</p>
<a href="${link}" style="display:inline-block;background:#18181b;color:#fafafa;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:500">Open the app</a>
`),
  });
}
