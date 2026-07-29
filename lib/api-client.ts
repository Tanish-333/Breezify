import { auth } from "@/lib/firebase";
import type { ModelId } from "@/lib/types";

export interface GenerateResponse {
  appId: string;
  appName: string;
  summary: string;
  files: Record<string, string>;
}

export async function generateAppRequest(prompt: string, model: ModelId): Promise<GenerateResponse> {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to generate an app.");

  const token = await user.getIdToken();
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ prompt, model }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Generation failed. Please try again.");
  }
  return data as GenerateResponse;
}
