"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { MODEL_INFO, type AppTurn } from "@/lib/types";
import { Check, Copy, FileCode2, History, Loader2 } from "lucide-react";

type Tab = "details" | "files";

function timeAgo(ms: number) {
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const KIND_LABEL: Record<AppTurn["kind"], string> = {
  build: "Built your app",
  refine: "Applied your change",
  revert: "Reverted to an earlier version",
  sync: "Synced from GitHub",
};

export function TurnCard({
  turn,
  files,
  isLatest,
  onRevert,
  reverting,
}: {
  turn: AppTurn;
  files: Record<string, string>;
  /** The current, live state, reverting to it would be a no-op. */
  isLatest?: boolean;
  onRevert?: () => void;
  reverting?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("details");
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const paths = Object.keys(files).sort();

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(turn.summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard permissions can block this; nothing to recover from.
    }
  }

  return (
    <div className="space-y-2">
      {/* What the user asked for */}
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-muted px-3.5 py-2 text-sm">
          {turn.instruction}
        </p>
      </div>

      {/* What the model did */}
      <div className="rounded-lg border border-border">
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <p className="truncate text-sm font-medium">{KIND_LABEL[turn.kind]}</p>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {timeAgo(turn.createdAt)}
          </span>
        </div>

        <div className="flex gap-1 p-2">
          {(["details", "files"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                tab === t
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="px-3 pb-3">
          {tab === "details" ? (
            <div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {turn.summary || "No summary was returned for this change."}
              </p>
              <div className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{MODEL_INFO[turn.model]?.label ?? turn.model}</span>
                <span>·</span>
                <span>{turn.fileCount} files</span>
                <button
                  onClick={copySummary}
                  className="ml-auto flex items-center gap-1 transition-colors hover:text-foreground"
                  title="Copy summary"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          ) : (
            <div className="max-h-44 space-y-0.5 overflow-y-auto">
              {paths.map((p) => (
                <div
                  key={p}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                >
                  <FileCode2 className="h-3 w-3 shrink-0" />
                  <span className="truncate font-mono">{p}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {!isLatest && onRevert && (
          <div className="border-t border-border px-3 py-2">
            {confirming ? (
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground">Revert to this version?</span>
                <button
                  onClick={() => {
                    setConfirming(false);
                    onRevert();
                  }}
                  className="font-medium text-foreground hover:underline"
                >
                  Yes, revert
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                disabled={reverting}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {reverting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <History className="h-3 w-3" />
                )}
                {reverting ? "Reverting..." : "Revert to this version"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
