import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "@/lib/verify-id-token";
import { commit, createWrite, getDoc, updateWrite } from "@/lib/firestore-rest";
import { hasAppAccess } from "@/lib/app-collaborators";
import { unsupportedReason } from "@/lib/app-support";
import { tryWrapExpressForVercel } from "@/lib/express-adapter";
import { IMPORT_MIN_PLAN, PLAN_RANK, PLANS, type PlanId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Same reasoning and value as app/api/generate/route.ts's own lock: past
// this, a claim is presumed crashed (the function was killed, or its final
// status write failed) rather than genuinely still running.
const GENERATING_LOCK_STALE_MS = 6 * 60 * 1000;

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
    if (!(await hasAppAccess(appId, appDoc.fields.userId as string, uid, idToken))) {
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

    // Claim the same "generating" lock a refine uses (see
    // app/api/generate/route.ts) before doing any of the slow GitHub work
    // below (up to 120s: a tree fetch plus up to 250 sequential blob
    // fetches). Without this, a sync racing a concurrent refine (or a
    // second sync) both read the same base `turns`/state, and whichever's
    // final commit lands last silently overwrites the other's — a refine
    // someone was watching complete could vanish the moment an unrelated
    // sync finishes moments later, with no error or conflict surfaced to
    // either person.
    const previousStatus = appDoc.fields.status as string | undefined;
    const lockStartedAtMs =
      typeof appDoc.fields.generatingStartedAt === "string" ? Date.parse(appDoc.fields.generatingStartedAt) : NaN;
    const lockIsStale = Number.isNaN(lockStartedAtMs) || Date.now() - lockStartedAtMs > GENERATING_LOCK_STALE_MS;
    if (previousStatus === "generating" && !lockIsStale) {
      return NextResponse.json(
        { error: "Someone else is already editing this app right now. Wait for them to finish, then try again." },
        { status: 409 }
      );
    }
    try {
      await commit(
        [
          updateWrite(
            `apps/${appId}`,
            { status: "generating", generatingBy: uid, generatingByEmail: null, generatingStartedAt: new Date() },
            ["status", "generatingBy", "generatingByEmail", "generatingStartedAt"]
          ),
        ],
        idToken
      );
    } catch (err) {
      console.error(`[github/sync] Failed to claim apps/${appId} for sync:`, err);
      return NextResponse.json({ error: "Couldn't start this sync. Please try again." }, { status: 500 });
    }

    // Everything from here through the final commit below runs with the
    // lock claimed above already held — any throw is caught by the
    // outer/local catch just below, which releases it before responding, so
    // every early exit (validation failure, a GitHub call failing) still
    // frees the app rather than leaving it stuck showing "generating"
    // forever.
    try {
      // Checked up front, same as /api/github/push: a 401/403 further down
      // (e.g. reading the tree) is otherwise indistinguishable from "wrong
      // repo" and never tells the dialog to clear a dead token.
      const who = await gh("/user", githubToken);
      if (!who.ok) {
        throw new Error("That GitHub token isn't valid, or it's missing the repo scope.");
      }

      const repoInfo = await gh(`/repos/${owner}/${repo}`, githubToken);
      if (!repoInfo.ok) {
        throw new Error(repoInfo.status === 404 ? "Repository not found or not accessible." : "Couldn't read that repository.");
      }
      const targetBranch = repoInfo.body.default_branch || "main";

      const treeRes = await gh(`/repos/${owner}/${repo}/git/trees/${targetBranch}?recursive=1`, githubToken);
      if (!treeRes.ok) {
        throw new Error("Couldn't read that branch's file tree.");
      }
      if (treeRes.body.truncated) {
        throw new Error("This repository is too large to sync in one go.");
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
      // Tracked separately from `skipped`: a blob fetch that failed (network
      // blip, transient 5xx, GitHub's rate limit hit partway through up to
      // 250 sequential un-throttled requests) is a real failure, not a file
      // that was filtered out for being binary/oversized. Lumping them into
      // one counter made a summary like "pulled 12 files (188 skipped:
      // binary or too large)" actively misleading — most of the repo could
      // have failed to fetch for a transient reason, not content filtering,
      // and for a sync this can mean silently replacing an app's real files
      // with a near-empty result while reporting a benign-looking cause.
      let fetchFailed = 0;

      for (const entry of entries.slice(0, MAX_FILES)) {
        if (totalBytes >= MAX_TOTAL_BYTES) {
          skipped++;
          continue;
        }
        const blob = await gh(`/repos/${owner}/${repo}/git/blobs/${entry.sha}`, githubToken);
        if (!blob.ok) {
          fetchFailed++;
          continue;
        }
        if (blob.body.encoding !== "base64") {
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
        throw new Error("No importable text files found in this repository.");
      }

      const wrapped = tryWrapExpressForVercel(files);
      const storedFiles = wrapped ? wrapped.files : files;

      const unsupported = unsupportedReason(storedFiles, "deploy");
      if (unsupported) {
        throw new Error(unsupported);
      }

      const existingTurns = Array.isArray(appDoc.fields.turns) ? (appDoc.fields.turns as unknown[]) : [];
      const turnId = randomUUID();
      const createdAt = new Date();
      const notes = [
        skipped ? `${skipped} file${skipped > 1 ? "s" : ""} skipped: binary or too large` : null,
        fetchFailed ? `${fetchFailed} file${fetchFailed > 1 ? "s" : ""} failed to fetch from GitHub and were left out — retry the sync to pick them up` : null,
      ].filter(Boolean);
      const turn = {
        id: turnId,
        kind: "sync",
        instruction: `Synced the latest commit from github.com/${owner}/${repo}`,
        summary: `Pulled ${Object.keys(files).length} files from github.com/${owner}/${repo}${notes.length ? ` (${notes.join("; ")})` : ""}.${wrapped ? ` ${wrapped.note}` : ""}`,
        model: appDoc.fields.model ?? "haiku",
        fileCount: Object.keys(storedFiles).length,
        createdAt,
      };

      await commit(
        [
          updateWrite(
            `apps/${appId}`,
            {
              generatedCode: { files: storedFiles },
              turns: [...existingTurns, turn],
              status: "ready",
              generatingBy: null,
              generatingByEmail: null,
              generatingStartedAt: null,
            },
            ["generatedCode", "turns", "status", "generatingBy", "generatingByEmail", "generatingStartedAt"]
          ),
          createWrite(`apps/${appId}/versions/${turnId}`, { userId: uid, files: storedFiles, createdAt }),
        ],
        idToken
      );

      return NextResponse.json({ fileCount: Object.keys(files).length, skipped, fetchFailed });
    } catch (err) {
      await commit(
        [
          updateWrite(
            `apps/${appId}`,
            {
              status: previousStatus && previousStatus !== "generating" ? previousStatus : "ready",
              generatingBy: null,
              generatingByEmail: null,
              generatingStartedAt: null,
            },
            ["status", "generatingBy", "generatingByEmail", "generatingStartedAt"]
          ),
        ],
        idToken
      ).catch(() => {
        // Ignore — the error response below is what the user sees either way.
      });
      const message = err instanceof Error ? err.message : "Failed to sync from GitHub.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync from GitHub.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
