"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  MODEL_IDS,
  MODEL_INFO,
  PROMPT_CHAR_LIMIT,
  planAllowsModel,
  requiredPlanFor,
  type ModelId,
  type PlanId,
} from "@/lib/types";
import { hasApiKey, isByokEnabled } from "@/lib/byok";
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Loader2,
  Lock,
  KeyRound,
  Mic,
  Paperclip,
  Square,
  X,
} from "lucide-react";

interface Attachment {
  name: string;
  content: string;
}

/** Text-ish files we can meaningfully inline into a prompt. */
const TEXT_EXT =
  /\.(txt|md|markdown|json|ya?ml|csv|tsv|ts|tsx|js|jsx|css|scss|html|py|rb|go|rs|java|sql|sh|env|toml|ini|xml)$/i;

function attachmentContext(attachments: Attachment[]) {
  return attachments.map((a) => `\n\n--- Attached file: ${a.name} ---\n${a.content}`).join("");
}

export function PromptComposer({
  value,
  onChange,
  model,
  onModelChange,
  plan,
  availability,
  onSubmit,
  loading,
  disabled,
  placeholder = "Describe the app you want to build...",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  model: ModelId;
  onModelChange: (m: ModelId) => void;
  plan: PlanId;
  availability?: Record<string, boolean>;
  /** Receives the prompt with any attached file context appended. */
  onSubmit: (composedPrompt: string) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState("");
  const [listening, setListening] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [micError, setMicError] = useState("");
  // Which providers the user has supplied a key for, with BYOK switched on.
  const [ownKeyFor, setOwnKeyFor] = useState<Record<string, boolean>>({});

  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const baseTextRef = useRef("");

  const info = MODEL_INFO[model];
  const usingOwnKey = ownKeyFor[info.provider] === true;
  // Your own key means your own bill, so the plan's character cap doesn't apply.
  const charLimit = usingOwnKey ? Infinity : PROMPT_CHAR_LIMIT[plan];
  const composedLength = value.trim().length + attachmentContext(attachments).length;
  const overLimit = composedLength > charLimit;
  // A missing balance shouldn't block you when you're paying your own bill.
  const canSubmit =
    value.trim().length >= 5 && !overLimit && !loading && (!disabled || usingOwnKey);

  // Feature-detect only. Constructing a recognizer does not prompt for the
  // microphone; permission is requested when start() runs on click.
  useEffect(() => {
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setMicSupported(Boolean(Ctor));
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Already stopped.
      }
    };
  }, []);

  useEffect(() => {
    function refresh() {
      const on = isByokEnabled();
      setOwnKeyFor({
        anthropic: on && hasApiKey("anthropic"),
        google: on && hasApiKey("google"),
      });
    }
    refresh();
    window.addEventListener("feather:byok-changed", refresh);
    return () => window.removeEventListener("feather:byok-changed", refresh);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  function toggleMic() {
    setMicError("");
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    // Everything spoken this session is appended to whatever was already typed.
    baseTextRef.current = value ? `${value.trimEnd()} ` : "";

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onChange(baseTextRef.current + transcript);
    };
    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicError("Microphone access was blocked. Enable it in your browser settings.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setMicError("Voice input stopped unexpectedly.");
      }
      setListening(false);
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setMicError("Couldn't start voice input.");
    }
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setAttachError("");
    const next: Attachment[] = [];
    // Attachments share the same per-plan character budget as the prompt
    // itself, so a large file can't be used to route around the cap.
    let budget = charLimit - value.trim().length - attachmentContext(attachments).length;
    for (const file of Array.from(fileList)) {
      if (!TEXT_EXT.test(file.name)) {
        setAttachError(`${file.name} isn't a text file, so it can't be attached.`);
        continue;
      }
      if (budget <= 0) {
        setAttachError(
          Number.isFinite(charLimit)
            ? "You've reached your plan's character limit. Upgrade for more room, or remove an attachment."
            : `${file.name} wasn't attached.`
        );
        continue;
      }
      const text = await file.text();
      const truncated = text.length > budget;
      const content = truncated ? `${text.slice(0, budget)}\n...[truncated]` : text;
      next.push({ name: file.name, content });
      budget -= content.length;
    }
    if (next.length) setAttachments((prev) => [...prev, ...next]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    if (!canSubmit) return;
    if (listening) recognitionRef.current?.stop();

    onSubmit(value.trim() + attachmentContext(attachments));
    setAttachments([]);
  }

  return (
    <div>
      <div className="rounded-xl border border-border bg-muted/25 p-2.5 shadow-lg shadow-black/20 transition-colors focus-within:border-muted-foreground">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pb-2">
            {attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground"
              >
                <FileText className="h-3 w-3" />
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="transition-colors hover:text-foreground"
                  title="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          disabled={loading}
          placeholder={listening ? "Listening..." : placeholder}
          className="w-full resize-none bg-transparent px-2 pt-1.5 text-base placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
        />

        <div className="flex items-center justify-between gap-2 px-1 pt-1">
          <div className="flex items-center gap-1.5">
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => fileRef.current?.click()}
              title="Attach a spec or reference file"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                disabled={loading}
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <span className="font-medium text-foreground">{info.label}</span>
                {usingOwnKey ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <KeyRound className="h-2.5 w-2.5" />
                    0.00
                  </span>
                ) : (
                  <span className="tabular-nums">{info.credits.toFixed(2)}</span>
                )}
                <ChevronDown className="h-3 w-3" />
              </button>

              {menuOpen && (
                <div className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-background p-1 shadow-xl">
                  {MODEL_IDS.map((id) => {
                    const m = MODEL_INFO[id];
                    const ownKey = ownKeyFor[m.provider] === true;
                    // Your own key means your own bill, so plan limits and
                    // whether Feather has a key for this provider don't apply.
                    const unlocked = ownKey || planAllowsModel(plan, id);
                    const configured =
                      ownKey || (availability ? availability[id] !== false : true);
                    const usable = unlocked && configured;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={!usable}
                        onClick={() => {
                          onModelChange(id);
                          setMenuOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
                          usable ? "hover:bg-muted" : "cursor-not-allowed opacity-55"
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium">{m.label}</span>
                            {!unlocked && <Lock className="h-3 w-3 text-muted-foreground" />}
                            {model === id && usable && (
                              <Check className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {m.providerLabel}
                            {ownKey
                              ? " · your key"
                              : !unlocked
                                ? ` · ${requiredPlanFor(id).name} plan`
                                : !configured
                                  ? " · not configured"
                                  : ""}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {ownKey ? "0.00" : m.credits.toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                  <Link
                    href="/billing"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1 block border-t border-border px-2.5 py-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Compare plans and unlock more models
                  </Link>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {micSupported && (
              <button
                type="button"
                disabled={loading}
                onClick={toggleMic}
                title={listening ? "Stop dictating" : "Dictate your idea"}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50",
                  listening
                    ? "border-error/50 bg-error/10 text-error"
                    : "border-border text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                )}
              >
                {listening ? (
                  <Square className="h-3 w-3 fill-current" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              aria-label="Generate app"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-85 disabled:opacity-30"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {(attachError || micError) && (
        <p className="mt-2 text-xs text-warning">{attachError || micError}</p>
      )}
      {!attachError && !micError && value.trim().length > 0 && value.trim().length < 5 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Add a bit more detail ({value.trim().length}/5 characters minimum).
        </p>
      )}
      {!attachError && !micError && overLimit && (
        <p className="mt-2 text-xs text-warning">
          {composedLength.toLocaleString()} / {charLimit.toLocaleString()} characters — over your
          plan's limit.{" "}
          <Link href="/billing" className="font-medium underline">
            Upgrade for more room
          </Link>
        </p>
      )}
      {!attachError && !micError && !overLimit && Number.isFinite(charLimit) && composedLength > charLimit * 0.7 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {composedLength.toLocaleString()} / {charLimit.toLocaleString()} characters
        </p>
      )}
      {listening && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-error" />
          Listening. Click the stop button when you&apos;re done.
        </p>
      )}
    </div>
  );
}
