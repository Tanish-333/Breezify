"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { ModelSelector } from "@/components/model-selector";
import { CodePreview } from "@/components/code-preview";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { generateAppRequest } from "@/lib/api-client";
import { takePendingPrompt } from "@/lib/pending-prompt";
import { MODEL_INFO, type ModelId } from "@/lib/types";
import { AlertCircle, Sparkles } from "lucide-react";

function BuildContent() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>("haiku");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ appId: string; appName: string; summary: string; files: Record<string, string> } | null>(null);

  useEffect(() => {
    const pending = takePendingPrompt();
    if (pending) setPrompt(pending);
  }, []);

  const cost = MODEL_INFO[model].credits;
  const insufficientCredits = (profile?.credits ?? 0) < cost;

  async function handleGenerate() {
    if (prompt.trim().length < 5) {
      setError("Describe your app in a bit more detail.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const res = await generateAppRequest(prompt, model);
      setResult(res);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-semibold tracking-tight">Build a new app</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe what you want. Feather writes the full, working codebase.
      </p>

      <div className="mt-8 space-y-6">
        <div>
          <label className="mb-1.5 block text-sm font-medium">What do you want to build?</label>
          <Textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A habit tracker with daily streaks, a calendar view, and local charts of progress over time..."
            disabled={loading}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Model</label>
          <ModelSelector value={model} onChange={setModel} />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded border border-error/30 bg-error/5 p-3 text-sm text-error">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {profile ? `${profile.credits.toFixed(2)} credits available` : ""}
          </span>
          <Button onClick={handleGenerate} loading={loading} disabled={insufficientCredits}>
            <Sparkles className="h-4 w-4" />
            {insufficientCredits ? "Not enough credits" : `Generate (${cost.toFixed(2)} credits)`}
          </Button>
        </div>

        {loading && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
            <Sparkles className="h-6 w-6 animate-pulse text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Writing your app with {MODEL_INFO[model].label}... this can take a minute.
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">{result.appName}</h2>
                <p className="text-sm text-muted-foreground">{result.summary}</p>
              </div>
              <Button variant="secondary" onClick={() => router.push(`/build/${result.appId}`)}>
                Open app
              </Button>
            </div>
            <CodePreview files={result.files} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function BuildPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <BuildContent />
      </AppShell>
    </ProtectedRoute>
  );
}
