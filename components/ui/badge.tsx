import { cn } from "@/lib/utils";
import type { AppStatus, DeployStatus } from "@/lib/types";

// "deploying"/"live" are kept here (rather than removed) purely so this map
// stays exhaustive over the full AppStatus union — see its doc comment in
// lib/types.ts. Callers should pass displayStatus(app.status), which never
// actually produces either value, so these two entries are effectively
// unreachable dead code kept only for type safety.
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

const DEPLOY_STATUS_CONFIG: Record<DeployStatus, { label: string; dot: string; text: string }> = {
  deploying: { label: "Deploying", dot: "bg-warning", text: "text-warning" },
  live: { label: "Live", dot: "bg-success", text: "text-success" },
  error: { label: "Deploy failed", dot: "bg-error", text: "text-error" },
};

/** Deploy lifecycle, shown alongside StatusBadge (generation lifecycle) — see effectiveDeployStatus() in lib/types.ts. Renders nothing for an app that's never been deployed. */
export function DeployBadge({ status, className }: { status: DeployStatus | null; className?: string }) {
  if (!status) return null;
  const cfg = DEPLOY_STATUS_CONFIG[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot, status === "deploying" ? "animate-pulse" : "")} />
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
