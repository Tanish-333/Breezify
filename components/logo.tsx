import { cn } from "@/lib/utils";

export function BreezeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("h-5 w-5", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="5" fill="#000" />
      <path d="M4 7c2-2 4 2 6 0s4 2 6 0" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M2 12c3-3 6 3 9 0s6 3 9 0" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M4 17c2-2 4 2 6 0s4 2 6 0" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <BreezeMark />
      {wordmark && <span>Breezify</span>}
    </span>
  );
}
