import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc, updateWrite } from "@/lib/firestore-rest";
import { unsupportedReason } from "@/lib/app-support";
import { IMPORT_MIN_PLAN, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const GH = "https://api.github.com";

// Same bounds as app/api/github/import, this pulls the same kind of tree.
const MAX_FILE_BYTES = 150_000;
const MAX_TOTAL_BYTES = 600_000;
const MAX_FILES = 250;

const SKIP_PATH_RE = /(^|\/)(node_modules|\.git|dist|build|coverage|\.next|\.vercel|\.turbo)\//i;
const SKIP_FILE_RE = /(^|\/)\.env(\..*)?$|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;
const BINARY_EXT_RE =
  /\.(png|jpe?g|gif|webp|ico|bmp|tiff?|svg|woff2?|ttf|eot|otf|mp3|mp4|mov|avi|webm|pdf|zip|tar|gz|7z|rar|exe|dll|so|dylib|class|jar|wasm|db|sqlite3?|psd|ai|eps|icns)$/i;

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

/** "owner/repo" out of any github.com repo URL Breezify itself generated. */
function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url.trim());
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
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
          { error: "Please verify your email before syncing repos." },
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

    const { appId, githubToken } = await req.json();
    if (!appId || typeof appId !== "string") {
      return NextResponse.json({ error: "Missing app." }, { status: 400 });
    }
    if (!githubToken || typeof githubToken !== "string") {
      return NextResponse.json({ error: "A GitHub token is required." }, { status: 400 });
    }

    // Pulling from GitHub shares Push/Import's Plus-and-up gate. Checked
    // server-side, not just hidden in the UI, since this is a real API a
    // client could hit directly.
    let userPlan: PlanId = "free";
    try {
      const userDoc = await getDoc(`users/${uid}`, idToken);
      userPlan = (userDoc?.fields.plan as PlanId) ?? "free";
    } catch {
      // If this fails, treat as free (blocked) rather than let the sync through.
    }
    if (PLAN_RANK[userPlan] < PLAN_RANK[IMPORT_MIN_PLAN]) {
      return NextResponse.json(
        { error: `Syncing from GitHub is available on the ${PLANS[IMPORT_MIN_PLAN].name} plan and above.` },
        { status: 403 }
      );
    }

    // Read the app with the user's own token, so Firestore rules confirm
    // ownership rather than us trusting the appId from the request body.
    const appDoc = await getDoc(`apps/${appId}`, idToken);
    if (!appDoc) {
      return NextResponse.json({ error: "App not found." }, { status: 404 });
    }
    if (appDoc.fields.userId !== uid) {
      return NextResponse.json({ error: "You don't have access to this app." }, { status: 403 });
    }
    const githubUrl = appDoc.fields.githubUrl as string | undefined;
    if (!githubUrl) {
      return NextResponse.json({ error: "This app isn't linked to a GitHub repository yet." }, { status: 400 });
    }
    const parsed = parseGithubUrl(githubUrl);
    if (!parsed) {
      return NextResponse.json({ error: "Couldn't parse this app's linked repository URL." }, { status: 400 });
    }
    const { owner, repo } = parsed;

    const repoInfo = await gh(`/repos/${owner}/${repo}`, githubToken);
    if (!repoInfo.ok) {
      return NextResponse.json(
        { error: repoInfo.status === 404 ? "Repository not found or not accessible." : "Couldn't read that repository." },
        { status: 400 }
      );
    }
    const targetBranch = repoInfo.body.default_branch || "main";

    const treeRes = await gh(`/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`, githubToken);
    if (!treeRes.ok) {
      return NextResponse.json({ error: "Couldn't read that branch's file tree." }, { status: 400 });
    }
    if (treeRes.body.truncated) {
      return NextResponse.json(
        { error: "This repository is too large to sync in one go." },
        { status: 400 }
      );
    }

    const entries = (treeRes.body.tree as { path: string; type: string; sha: string; size?: number }[]).filter(
      (e) =>
        e.type === "blob" &&
        !SKIP_PATH_RE.test(e.path) &&
        !SKIP_FILE_RE.test(e.path) &&
        !BINARY_EXT_RE.test(e.path) &&
        (e.size ?? 0) <= MAX_FILE_BYTES
    );

    const files: Record<string, string> = {};
    let totalBytes = 0;
    let skipped = entries.length > MAX_FILES ? entries.length - MAX_FILES : 0;

    for (const entry of entries.slice(0, MAX_FILES)) {
      if (totalBytes >= MAX_TOTAL_BYTES) {
        skipped++;
        continue;
      }
      const blob = await gh(`/repos/${owner}/${repo}/git/blobs/${entry.sha}`, githubToken);
      if (!blob.ok || blob.body.encoding !== "base64") {
        skipped++;
        continue;
      }
      let content: string;
      try {
        content = Buffer.from(blob.body.content as string, "base64").toString("utf8");
      } catch {
        skipped++;
        continue;
      }
      if (content.includes("�")) {
        skipped++;
        continue;
      }
      totalBytes += content.length;
      files[entry.path] = content;
    }

    if (Object.keys(files).length === 0) {
      return NextResponse.json(
        { error: "No importable text files found in this repository." },
        { status: 400 }
      );
    }

    const unsupported = unsupportedReason(files, "deploy");
    if (unsupported) {
      return NextResponse.json({ error: unsupported }, { status: 400 });
    }

    const existingTurns = Array.isArray(appDoc.fields.turns) ? (appDoc.fields.turns as unknown[]) : [];
    const turnId = randomUUID();
    const createdAt = new Date();
    const turn = {
      id: turnId,
      kind: "sync",
      instruction: `Synced the latest commit from github.com/${owner}/${repo}`,
      summary: `Pulled ${Object.keys(files).length} files from github.com/${owner}/${repo}${skipped ? ` (${skipped} files skipped: binary or too large)` : ""}.`,
      model: appDoc.fields.model ?? "haiku",
      fileCount: Object.keys(files).length,
      createdAt,
    };

    await commit(
      [
        updateWrite(
          `apps/${appId}`,
          { generatedCode: { files }, turns: [...existingTurns, turn] },
          ["generatedCode", "turns"]
        ),
        createWrite(`apps/${appId}/versions/${turnId}`, { files, createdAt }),
      ],
      idToken
    );

    return NextResponse.json({ fileCount: Object.keys(files).length, skipped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync from GitHub.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
