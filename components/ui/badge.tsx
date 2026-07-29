import { cn } from "@/lib/utils";
import type { AppStatus } from "@/lib/types";

const STATUS_CONFIG: Record<AppStatus, { label: string; dot: string; text: string }> = {
  generating: { label: "Generating", dot: "bg-warning", text: "text-warning" },
  ready: { label: "Ready", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  deploying: { label: "Deploying", dot: "bg-warning", text: "text-warning" },
  live: { label: "Live", dot: "bg-success", text: "text-success" },
  error: { label: "Error", dot: "bg-error", text: "text-error" },
  stopped: { label: "Stopped", dot: "bg-muted-foreground", text: "text-muted-foreground" },
};

export function StatusBadge({ status, className }: { status: AppStatus; className?: string }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot, status === "generating" || status === "deploying" ? "animate-pulse" : "")} />
      <span className={cfg.text}>{cfg.label}</span>
    </span>
  );
}

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2.5 py-1 text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}
