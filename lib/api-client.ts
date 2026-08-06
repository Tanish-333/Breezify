import { auth } from "@/lib/firebase";
import type { ModelId } from "@/lib/types";

export interface GenerateResult {
  appId: string;
  appName: string;
  summary: string;
  files: Record<string, string>;
}

export interface ClarifyQuestion {
  question: string;
  options: string[];
}

export interface GenerateHandlers {
  onStatus?: (message: string) => void;
  onProgress?: (progress: { chars: number; files: string[] }) => void;
}

/**
 * Streams a generation over SSE. Resolves with the finished app, or with up
 * to 2 clarifying questions the model needs answered before it can build
 * (only possible on a first-time build, never a refine) — asked one at a
 * time client-side, see answerClarify in app/dashboard/page.tsx — or
 * rejects with the server's error message.
 */
export async function generateAppRequest(
  prompt: string,
  model: ModelId,
  handlers: GenerateHandlers = {},
  signal?: AbortSignal,
  /** Pass an app id to refine that app instead of building a new one. */
  appId?: string,
  /** Set once the user has already answered every clarifying question. */
  clarified?: boolean
): Promise<GenerateResult | { clarify: ClarifyQuestion[] }> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to generate an app.");

  const token = await user.getIdToken();
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      prompt,
      model,
      ...(appId ? { appId } : {}),
      ...(clarified ? { clarified: true } : {}),
    }),
    signal,
  });

  if (!res.body) throw new Error("Generation failed to start. Please try again.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerateResult | null = null;
  let clarify: ClarifyQuestion[] | null = null;
  let error: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let event: any;
      try {
        event = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }

      if (event.type === "status") handlers.onStatus?.(event.message);
      else if (event.type === "progress")
        handlers.onProgress?.({ chars: event.chars, files: event.files });
      else if (event.type === "done") result = event;
      else if (event.type === "clarify") clarify = event.questions;
      else if (event.type === "error") error = event.error;
    }
  }

  if (error) throw new Error(error);
  if (clarify) return { clarify };
  if (!result) throw new Error("Generation ended unexpectedly. Please try again.");
  return result;
}

export async function fetchModelAvailability(): Promise<Record<string, boolean>> {
  const res = await fetch("/api/models");
  if (!res.ok) return {};
  const data = await res.json();
  return data.available ?? {};
}

/** Duplicates an app into a brand new one the caller owns — see app/api/apps/duplicate for the plan gate. */
export async function duplicateAppRequest(appId: string): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const res = await fetch("/api/apps/duplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ appId }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't duplicate this app.");
  return data.appId as string;
}

/** Deletes an app entirely — see app/api/apps/[appId] (DELETE). Immediately frees its active-subdomain slot, if any. */
export async function deleteAppRequest(appId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const res = await fetch(`/api/apps/${encodeURIComponent(appId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't delete this app.");
}

/** Takes an app offline without deleting it, freeing its active-subdomain slot — see app/api/apps/[appId]/undeploy. */
export async function undeployAppRequest(appId: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const res = await fetch(`/api/apps/${encodeURIComponent(appId)}/undeploy`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't undeploy this app.");
}

/** Renews a free-tier app's expiry clock — only accepted inside its renewal window, see app/api/apps/[appId]/renew. */
export async function renewAppRequest(appId: string): Promise<number> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in.");
  const idToken = await user.getIdToken();
  const res = await fetch(`/api/apps/${encodeURIComponent(appId)}/renew`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Couldn't renew this app.");
  return data.deployExpiresAt as number;
}
