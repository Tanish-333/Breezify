import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, getDoc, updateWrite } from "@/lib/firestore-rest";
import { hasEditAccess } from "@/lib/app-collaborators";
import { withWatermark } from "@/lib/watermark";
import type { PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const GH = "https://api.github.com";

/**
 * The caller's GitHub token is used for this request only and never persisted.
 * Breezify stores the resulting repo URL, not the credential.
 */
function ghHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
}

async function gh(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GH}${path}`, { ...init, headers: ghHeaders(token) });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    // Non-JSON error bodies are rare but possible; keep the raw text.
  }
  return { ok: res.ok, status: res.status, body };
}

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
          { error: "Please verify your email before pushing to GitHub." },
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

    const { appId, githubToken, repoName, isPrivate } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }
    if (!githubToken || typeof githubToken !== "string") {
      return NextResponse.json({ error: "A GitHub token is required." }, { status: 400 });
    }
    const name = String(repoName || "").trim();
    if (!/^[A-Za-z0-9._-]{1,100}$/.test(name)) {
      return NextResponse.json(
        { error: "Repository names can only contain letters, numbers, dots, hyphens, and underscores." },
        { status: 400 }
      );
    }

    // Pushing to GitHub is a Plus-and-up feature. Checked server-side, not
    // just hidden in the UI, since this is a real API a client could hit
    // directly.
    let userPlan: PlanId = "free";
    try {
      const userDoc = await getDoc(`users/${uid}`, idToken);
      userPlan = (userDoc?.fields.plan as PlanId) ?? "free";
    } catch {
      // If this fails, treat as free (blocked) rather than let the push through.
    }
    if (userPlan === "free") {
      return NextResponse.json(
        { error: "Pushing to GitHub is available on the Plus plan and above." },
        { status: 403 }
      );
    }

    // Read the app with the user's own token, so Firestore rules confirm
    // ownership rather than us trusting the appId from the request body.
    const appDoc = await getDoc(`apps/${appId}`, idToken);
    if (!appDoc) {
      return NextResponse.json({ error: "App not found." }, { status: 404 });
    }
    if (!(await hasEditAccess(appId, appDoc.fields.userId as string, uid, idToken))) {
      return NextResponse.json({ error: "You have view-only access to this app — ask the owner to make you an editor to do this." }, { status: 403 });
    }

    const generated = appDoc.fields.generatedCode as { files?: Record<string, string> } | undefined;
    // Paid plans push clean; the stored source itself never carries the badge.
    const files = withWatermark(generated?.files ?? {}, false);
    if (Object.keys(files).length === 0) {
      return NextResponse.json({ error: "This app has no files to push." }, { status: 400 });
    }

    const who = await gh("/user", githubToken);
    if (!who.ok) {
      return NextResponse.json(
        { error: "That GitHub token isn't valid, or it's missing the repo scope." },
        { status: 400 }
      );
    }
    const owner = who.body.login as string;

    // 1. Create the repository, empty so we control the initial commit.
    const created = await gh("/user/repos", githubToken, {
      method: "POST",
      body: JSON.stringify({
        name,
        private: Boolean(isPrivate),
        auto_init: false,
        description: (appDoc.fields.summary as string) || "Built with Breezify",
      }),
    });
    if (!created.ok) {
      const msg =
        created.status === 422
          ? `You already have a repository named "${name}".`
          : created.body?.message || "Couldn't create the repository.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const defaultBranch = (created.body.default_branch as string) || "main";
    const repoUrlForCleanup = created.body.html_url as string;
    // Every failure from here on happens AFTER the real repo already exists
    // on GitHub (step 1 above), so retrying with the same name just hits
    // "You already have a repository named X" with no indication why, or
    // what to do about it — the repo this created is otherwise invisible to
    // Breezify (githubUrl is only persisted on full success, further down).
    // Appended to every failure past this point so the person actually
    // knows an empty repo now exists and where to find it.
    const orphanedRepoNote = ` A repository was already created at ${repoUrlForCleanup} — delete it on GitHub or push under a different name.`;

    // 2. Upload each file as a blob.
    const entries = Object.entries(files);
    const blobs: { path: string; sha: string }[] = [];
    for (const [path, content] of entries) {
      const clean = path
        .replace(/\\/g, "/")
        .split("/")
        .filter((seg) => seg && seg !== "." && seg !== "..")
        .join("/");
      if (!clean) continue;
      const blob = await gh(`/repos/${owner}/${name}/git/blobs`, githubToken, {
        method: "POST",
        body: JSON.stringify({
          content: Buffer.from(content, "utf8").toString("base64"),
          encoding: "base64",
        }),
      });
      if (!blob.ok) {
        return NextResponse.json(
          { error: `Failed to upload ${clean}: ${blob.body?.message ?? blob.status}.${orphanedRepoNote}` },
          { status: 502 }
        );
      }
      blobs.push({ path: clean, sha: blob.body.sha });
    }

    // 3. Build a tree, 4. commit it, 5. point the default branch at it.
    const tree = await gh(`/repos/${owner}/${name}/git/trees`, githubToken, {
      method: "POST",
      body: JSON.stringify({
        tree: blobs.map((b) => ({ path: b.path, mode: "100644", type: "blob", sha: b.sha })),
      }),
    });
    if (!tree.ok) {
      return NextResponse.json(
        { error: `${tree.body?.message || "Failed to build the commit tree."}${orphanedRepoNote}` },
        { status: 502 }
      );
    }

    const commitRes = await gh(`/repos/${owner}/${name}/git/commits`, githubToken, {
      method: "POST",
      body: JSON.stringify({
        message: "Initial commit from Breezify",
        tree: tree.body.sha,
        parents: [],
      }),
    });
    if (!commitRes.ok) {
      return NextResponse.json(
        { error: `${commitRes.body?.message || "Failed to create the commit."}${orphanedRepoNote}` },
        { status: 502 }
      );
    }

    const ref = await gh(`/repos/${owner}/${name}/git/refs`, githubToken, {
      method: "POST",
      body: JSON.stringify({ ref: `refs/heads/${defaultBranch}`, sha: commitRes.body.sha }),
    });
    if (!ref.ok) {
      return NextResponse.json(
        { error: `${ref.body?.message || "Failed to publish the branch."}${orphanedRepoNote}` },
        { status: 502 }
      );
    }

    // Persist only the public repo URL.
    await commit(
      [updateWrite(`apps/${appId}`, { githubUrl: repoUrlForCleanup }, ["githubUrl"])],
      idToken
    );

    return NextResponse.json({ url: repoUrlForCleanup, files: blobs.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to push to GitHub.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
