import { cn } from "@/lib/utils";

export function FeatherMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("h-5 w-5", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M20.5 3.5C14 3.5 4 8 4 17c0 1.1.9 2 2 2h1.5l1.8-4.2 2.5 1-1.6 3.7c4.9-1 9-4.7 10.3-9.6.6-2.3.9-4.5.5-6.4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 19 20.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className, wordmark = true }: { className?: string; wordmark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <FeatherMark />
      {wordmark && <span>Feather 123</span>}
    </span>
  );
}
