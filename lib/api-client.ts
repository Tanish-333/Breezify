import { auth } from "@/lib/firebase";
import type { ModelId } from "@/lib/types";

export interface GenerateResult {
  appId: string;
  appName: string;
  summary: string;
  files: Record<string, string>;
}

export interface GenerateHandlers {
  onStatus?: (message: string) => void;
  onProgress?: (progress: { chars: number; files: string[] }) => void;
}

/**
 * Streams a generation over SSE. Resolves with the finished app, or rejects
 * with the server's error message.
 */
export async function generateAppRequest(
  prompt: string,
  model: ModelId,
  handlers: GenerateHandlers = {},
  signal?: AbortSignal,
  /** Pass an app id to refine that app instead of building a new one. */
  appId?: string
): Promise<GenerateResult> {
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
    }),
    signal,
  });

  if (!res.body) throw new Error("Generation failed to start. Please try again.");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: GenerateResult | null = null;
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
      else if (event.type === "error") error = event.error;
    }
  }

  if (error) throw new Error(error);
  if (!result) throw new Error("Generation ended unexpectedly. Please try again.");
  return result;
}

export async function fetchModelAvailability(): Promise<Record<string, boolean>> {
  const res = await fetch("/api/models");
  if (!res.ok) return {};
  const data = await res.json();
  return data.available ?? {};
}
