"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { ModelSelector } from "@/components/model-selector";
import { CodePreview } from "@/components/code-preview";
import { GenerationProgress } from "@/components/generation-progress";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import {
  fetchModelAvailability,
  generateAppRequest,
  type ClarifyQuestion,
  type GenerateResult,
} from "@/lib/api-client";
import { setPendingPrompt, takePendingPrompt } from "@/lib/pending-prompt";
import { getDefaultModel } from "@/lib/preferences";
import {
  MODEL_INFO,
  PLANS,
  PROMPT_CHAR_LIMIT,
  planAllowsModel,
  type ModelId,
  type PlanId,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { AlertCircle, ArrowRight, Wand2, X } from "lucide-react";

const STARTERS = [
  "A habit tracker with daily streaks and a calendar heatmap",
  "An invoice generator with a client list and PDF export",
  "A markdown note app with tags and full-text search",
  "A team standup board with async check-ins",
];

function BuildContent() {
  const router = useRouter();
  const { profile, refreshProfile } = useAuth();
  const plan: PlanId = profile?.plan ?? "free";

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>("haiku");
  const [availability, setAvailability] = useState<Record<string, boolean>>();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState({ chars: 0, files: [] as string[] });
  const [error, setError] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);
  // 0-2 questions from a single clarify round, walked through sequentially —
  // see the matching state in app/dashboard/page.tsx for the full reasoning.
  const [clarify, setClarify] = useState<ClarifyQuestion[] | null>(null);
  const [clarifyIndex, setClarifyIndex] = useState(0);
  const [clarifyAnswers, setClarifyAnswers] = useState<string[]>([]);
  const [clarifyAnswer, setClarifyAnswer] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const pending = takePendingPrompt();
    if (pending) setPrompt(pending);
    fetchModelAvailability().then(setAvailability).catch(() => {});
    // A preference set on the Settings page (see lib/preferences.ts); only
    // applied if the user's plan actually still covers it.
    const preferred = getDefaultModel();
    if (preferred && planAllowsModel(plan, preferred)) setModel(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the user's plan doesn't cover the selected model, fall back to Haiku,
  // which every plan includes.
  useEffect(() => {
    if (!planAllowsModel(plan, model)) setModel("haiku");
  }, [plan, model]);

  const cost = MODEL_INFO[model].credits;
  const insufficientCredits = profile !== null && profile.credits < cost;
  const charLimit = PROMPT_CHAR_LIMIT[plan];
  const overLimit = prompt.trim().length > charLimit;
  const canSubmit = prompt.trim().length >= 5 && !overLimit && !insufficientCredits;

  async function handleGenerate(overridePrompt?: string, isClarified = false) {
    const text = overridePrompt ?? prompt;
    if (text.trim().length < 5) {
      setError("Describe your app in a bit more detail.");
      return;
    }
    if (text.length > charLimit) {
      setError(`${PLANS[plan]?.name ?? "Free"} plan prompts are limited to ${charLimit.toLocaleString()} characters.`);
      return;
    }
    setError("");
    setResult(null);
    setClarify(null);
    setClarifyIndex(0);
    setClarifyAnswers([]);
    setClarifyAnswer("");
    setProgress({ chars: 0, files: [] });
    setStatus("Starting");
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await generateAppRequest(
        text,
        model,
        {
          onStatus: setStatus,
          onProgress: setProgress,
        },
        controller.signal,
        undefined,
        isClarified
      );
      await refreshProfile();
      if ("clarify" in res) {
        setClarify(res.clarify);
      } else {
        setResult(res);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") {
        setError("Generation cancelled.");
      } else {
        setError(err instanceof Error ? err.message : "Generation failed.");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  function answerClarify(answer: string) {
    const trimmed = answer.trim();
    if (!clarify || !trimmed) return;
    const answers = [...clarifyAnswers, trimmed];
    if (clarifyIndex + 1 < clarify.length) {
      setClarifyAnswers(answers);
      setClarifyIndex((i) => i + 1);
      setClarifyAnswer("");
      return;
    }
    const qa = clarify.map((q, i) => `${q.question} ${answers[i]}`).join("\n\n");
    const combined = `${prompt}\n\n${qa}`;
    setPrompt(combined);
    handleGenerate(combined, true);
  }

  function cancel() {
    abortRef.current?.abort();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Build a new app</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Describe what you want. Breezify writes the full, working codebase.
        </p>
      </div>

      <div className="space-y-7">
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label htmlFor="prompt" className="text-sm font-medium">
              What do you want to build?
            </label>
            <span className={cn("text-xs", overLimit ? "text-warning" : "text-muted-foreground")}>
              {prompt.trim().length > 0 &&
                (prompt.trim().length < 5
                  ? `${prompt.trim().length}/5 characters minimum`
                  : `${prompt.trim().length.toLocaleString()} / ${charLimit.toLocaleString()} characters`)}
            </span>
          </div>
          <Textarea
            id="prompt"
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit && !loading) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            maxLength={charLimit}
            placeholder="A habit tracker with daily streaks, a calendar view, and charts of progress over time..."
            disabled={loading}
            className="text-base"
          />
          {overLimit && (
            <p className="mt-1.5 text-xs text-warning">
              {PLANS[plan]?.name ?? "Free"} plan prompts are limited to{" "}
              {charLimit.toLocaleString()} characters.{" "}
              <Link href="/billing" className="font-medium underline">
                Upgrade for more room
              </Link>
            </p>
          )}
          {!loading && (
            <div className="mt-3 flex flex-wrap gap-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setPrompt(s)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <label className="text-sm font-medium">Model</label>
            <Link
              href="/billing"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Compare plans
            </Link>
          </div>
          <ModelSelector
            value={model}
            onChange={setModel}
            plan={plan}
            availability={availability}
            onLockedNavigate={() => prompt.trim() && setPendingPrompt(prompt)}
            disabled={loading}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/5 p-3.5 text-sm text-error">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            {insufficientCredits && (
              <Link href="/billing" className="shrink-0 font-medium underline">
                Get credits
              </Link>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <div className="text-sm text-muted-foreground">
            {profile ? (
              <>
                <span className="font-medium text-foreground">
                  {profile.credits.toFixed(2)}
                </span>{" "}
                credits available
              </>
            ) : (
              "Loading account"
            )}
          </div>
          <div className="flex items-center gap-2">
            {loading && (
              <Button variant="ghost" onClick={cancel}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
            <Button onClick={() => handleGenerate()} loading={loading} disabled={!canSubmit}>
              {!loading && <Wand2 className="h-4 w-4" />}
              {insufficientCredits
                ? "Not enough credits"
                : loading
                  ? "Generating"
                  : `Generate for ${cost.toFixed(2)}`}
            </Button>
          </div>
        </div>

        {loading && (
          <GenerationProgress
            status={status}
            chars={progress.chars}
            files={progress.files}
            modelLabel={MODEL_INFO[model].label}
          />
        )}

        {clarify && !loading && (
          <div className="animate-in space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            {clarify.length > 1 && (
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Question {clarifyIndex + 1} of {clarify.length}
              </p>
            )}
            <p className="text-sm font-medium">{clarify[clarifyIndex].question}</p>
            <p className="text-xs text-muted-foreground">
              Answering costs nothing extra beyond the 0.50 credits already used to ask.
            </p>
            {clarify[clarifyIndex].options.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {clarify[clarifyIndex].options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => answerClarify(opt)}
                    className="rounded-full border border-border px-3 py-1.5 text-xs transition-colors hover:border-foreground hover:text-foreground"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input
                value={clarifyAnswer}
                onChange={(e) => setClarifyAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && clarifyAnswer.trim()) answerClarify(clarifyAnswer);
                }}
                placeholder="Or type your own answer..."
                className="flex h-9 w-full rounded border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground"
              />
              <Button size="sm" disabled={!clarifyAnswer.trim()} onClick={() => answerClarify(clarifyAnswer)}>
                {clarifyIndex + 1 < clarify.length ? "Next" : "Continue"}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4 animate-in">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium">{result.appName}</h2>
                {result.summary && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{result.summary}</p>
                )}
              </div>
              <Button variant="secondary" onClick={() => router.push(`/build/${result.appId}`)}>
                Open app
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
            <CodePreview files={result.files} appName={result.appName} locked={plan === "free"} />
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
