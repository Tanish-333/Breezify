import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { getDoc } from "@/lib/firestore-rest";
import { IMPORT_MIN_PLAN, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";

export const runtime = "nodejs";

const GH = "https://api.github.com";

function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function gh(path: string, token: string) {
  const res = await fetch(`${GH}${path}`, { headers: ghHeaders(token) });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON error bodies are rare but possible; keep the raw text.
  }
  return { ok: res.ok, status: res.status, body };
}

/**
 * Lists the connected account's repos so the import dialog can offer a
 * searchable picker instead of asking someone to type "owner/repo" by
 * hand. One page of the 100 most recently pushed-to repos across personal,
 * collaborator, and org access is plenty for a picker (search narrows a
 * fetched list client-side rather than paging further).
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!idToken) {
      return NextResponse.json({ error: "Missing authorization token." }, { status: 401 });
    }

    let uid: string;
    try {
      const verified = await verifyIdToken(idToken);
      if (!verified.emailVerified) {
        return NextResponse.json(
          { error: "Please verify your email before importing repos." },
          { status: 403 }
        );
      }
      uid = verified.uid;
    } catch {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    const { githubToken } = await req.json();
    if (!githubToken || typeof githubToken !== "string") {
      return NextResponse.json({ error: "A GitHub token is required." }, { status: 400 });
    }

    // Same Plus-and-up gate as import/sync, checked server-side.
    let userPlan: PlanId = "free";
    try {
      const userDoc = await getDoc(`users/${uid}`, idToken);
      userPlan = (userDoc?.fields.plan as PlanId) ?? "free";
    } catch {
      // If this fails, treat as free (blocked) rather than let the list through.
    }
    if (PLAN_RANK[userPlan] < PLAN_RANK[IMPORT_MIN_PLAN]) {
      return NextResponse.json(
        { error: `Importing from GitHub is available on the ${PLANS[IMPORT_MIN_PLAN].name} plan and above.` },
        { status: 403 }
      );
    }

    const res = await gh(
      "/user/repos?per_page=100&sort=pushed&direction=desc&affiliation=owner,collaborator,organization_member",
      githubToken
    );
    if (!res.ok) {
      // 403 here is very often GitHub's primary/secondary rate limit, not
      // an invalid token — the client matches this message against /token/i
      // and force-clears a perfectly good stored token on any match,
      // sending the user through OAuth again for no reason. Only a genuine
      // 401 means the token itself is bad.
      const message =
        res.status === 401
          ? "That GitHub token isn't valid, or it's missing the repo scope."
          : res.status === 403
            ? "GitHub is rate-limiting this request. Wait a minute and try again."
            : "Couldn't load your repositories from GitHub. Please try again.";
      return NextResponse.json({ error: message }, { status: res.status === 401 ? 400 : 502 });
    }

    const repos = (res.body as any[]).map((r) => ({
      owner: r.owner.login as string,
      name: r.name as string,
      fullName: r.full_name as string,
      defaultBranch: (r.default_branch as string) || "main",
      private: Boolean(r.private),
      description: (r.description as string | null) ?? null,
      pushedAt: r.pushed_at as string | null,
    }));

    return NextResponse.json({ repos });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list repositories.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
