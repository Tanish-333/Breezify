/**
 * Abstract, hand-drawn SVG "cover" illustrations for the /templates grid —
 * one per lib/templates.ts template id, in place of the old icon-on-flat-
 * gradient hero (see components/templates-section.tsx's TemplateCard).
 * Each cover is a tiny, dependency-free inline SVG that abstractly evokes
 * that app's UI (a calendar heatmap, a kanban board, a donut chart, ...)
 * rather than a literal screenshot — deliberately stylized, like Linear
 * or Vercel's template gallery cards. Every cover shares a 200x80 canvas
 * and a soft drop-shadow filter so the grid reads as one consistent
 * system despite each having its own accent color.
 */
import type { CSSProperties } from "react";

interface CoverProps {
  className?: string;
}

const VIEWBOX = "0 0 200 80";

function Shell({
  id,
  bg,
  className,
  children,
}: {
  id: string;
  bg: [string, string];
  className?: string;
  children: React.ReactNode;
}) {
  const filterId = `${id}-shadow`;
  const gradId = `${id}-bg`;
  return (
    <svg
      viewBox={VIEWBOX}
      className={className}
      style={{ width: "100%", height: "100%" } as CSSProperties}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={bg[0]} />
          <stop offset="100%" stopColor={bg[1]} />
        </linearGradient>
        <filter id={filterId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#0f172a" floodOpacity="0.16" />
        </filter>
      </defs>
      <rect width="200" height="80" fill={`url(#${gradId})`} />
      <g filter={`url(#${filterId})`}>{children}</g>
    </svg>
  );
}

function HabitTrackerCover({ className }: CoverProps) {
  const cols = 10;
  const rows = 4;
  const cell = 12;
  const gap = 3;
  const startX = 14;
  const startY = 14;
  // Deterministic pseudo-random-ish intensity per cell for a heatmap look.
  const levels = [0, 1, 2, 3];
  const seq = [3, 1, 0, 2, 3, 2, 1, 0, 2, 3, 0, 2, 1, 3, 2, 0, 1, 3, 2, 1, 1, 0, 3, 2, 1, 0, 2, 3, 1, 0, 2, 1, 3, 0, 2, 1, 3, 2, 0, 1];
  const colors = ["#dcfce7", "#86efac", "#22c55e", "#15803d"];
  return (
    <Shell id="habit" bg={["#f0fdf4", "#dcfce7"] as [string, string]} className={className}>
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => {
          const level = levels[seq[(r * cols + c) % seq.length]];
          return (
            <rect
              key={`${r}-${c}`}
              x={startX + c * (cell + gap)}
              y={startY + r * (cell + gap)}
              width={cell}
              height={cell}
              rx={3}
              fill={colors[level]}
            />
          );
        })
      )}
    </Shell>
  );
}

function MarkdownNotesCover({ className }: CoverProps) {
  return (
    <Shell id="mdnotes" bg={["#f5f3ff", "#ede9fe"] as [string, string]} className={className}>
      <rect x="14" y="14" width="46" height="52" rx="6" fill="#ffffff" />
      <rect x="21" y="23" width="32" height="4" rx="2" fill="#a78bfa" />
      <rect x="21" y="32" width="26" height="3" rx="1.5" fill="#d8d2f7" />
      <rect x="21" y="39" width="30" height="3" rx="1.5" fill="#d8d2f7" />
      <rect x="21" y="46" width="20" height="3" rx="1.5" fill="#d8d2f7" />
      <rect x="68" y="14" width="118" height="52" rx="6" fill="#ffffff" />
      <rect x="76" y="23" width="40" height="5" rx="2.5" fill="#6d28d9" />
      <rect x="76" y="34" width="90" height="3" rx="1.5" fill="#e4defb" />
      <rect x="76" y="41" width="80" height="3" rx="1.5" fill="#e4defb" />
      <rect x="76" y="48" width="86" height="3" rx="1.5" fill="#e4defb" />
      <rect x="76" y="55" width="60" height="3" rx="1.5" fill="#e4defb" />
    </Shell>
  );
}

function InvoiceGeneratorCover({ className }: CoverProps) {
  return (
    <Shell id="invoice" bg={["#fffbeb", "#fef3c7"] as [string, string]} className={className}>
      <rect x="30" y="12" width="140" height="56" rx="6" fill="#ffffff" />
      <rect x="42" y="22" width="38" height="5" rx="2.5" fill="#92400e" />
      <rect x="130" y="22" width="28" height="5" rx="2.5" fill="#d97706" />
      <line x1="42" y1="35" x2="158" y2="35" stroke="#fde68a" strokeWidth="1.5" />
      <rect x="42" y="41" width="60" height="3" rx="1.5" fill="#fcd34d" />
      <rect x="140" y="41" width="18" height="3" rx="1.5" fill="#fcd34d" />
      <rect x="42" y="49" width="50" height="3" rx="1.5" fill="#fde68a" />
      <rect x="140" y="49" width="18" height="3" rx="1.5" fill="#fde68a" />
      <line x1="42" y1="56" x2="158" y2="56" stroke="#fde68a" strokeWidth="1.5" />
      <rect x="120" y="60" width="38" height="5" rx="2.5" fill="#b45309" />
    </Shell>
  );
}

function TeamStandupCover({ className }: CoverProps) {
  const colors = ["#60a5fa", "#38bdf8", "#818cf8"];
  return (
    <Shell id="standup" bg={["#eff6ff", "#dbeafe"] as [string, string]} className={className}>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${16 + i * 60}, 14)`}>
          <rect width="52" height="52" rx="8" fill="#ffffff" />
          <circle cx="14" cy="14" r="7" fill={colors[i]} />
          <rect x="25" y="10" width="20" height="3.5" rx="1.75" fill="#1e3a8a" opacity="0.7" />
          <rect x="9" y="26" width="36" height="3" rx="1.5" fill="#c7d9f5" />
          <rect x="9" y="33" width="30" height="3" rx="1.5" fill="#c7d9f5" />
          <rect x="9" y="40" width="24" height="3" rx="1.5" fill="#c7d9f5" />
        </g>
      ))}
    </Shell>
  );
}

function MiniCrmCover({ className }: CoverProps) {
  const cols = [
    { x: 14, cards: 1, color: "#f0abfc" },
    { x: 62, cards: 2, color: "#c084fc" },
    { x: 110, cards: 1, color: "#a78bfa" },
    { x: 158, cards: 1, color: "#818cf8" },
  ];
  return (
    <Shell id="crm" bg={["#fdf4ff", "#fae8ff"] as [string, string]} className={className}>
      {cols.map((col, i) => (
        <g key={i}>
          <rect x={col.x} y="12" width="30" height="56" rx="6" fill="#ffffff" fillOpacity="0.7" />
          <rect x={col.x + 5} y="18" width="16" height="3" rx="1.5" fill="#86198f" opacity="0.5" />
          {Array.from({ length: col.cards }).map((_, j) => (
            <rect key={j} x={col.x + 5} y={26 + j * 16} width="20" height="11" rx="3" fill={col.color} />
          ))}
        </g>
      ))}
    </Shell>
  );
}

function BudgetTrackerCover({ className }: CoverProps) {
  return (
    <Shell id="budget" bg={["#ecfdf5", "#d1fae5"] as [string, string]} className={className}>
      <circle cx="46" cy="40" r="26" fill="none" stroke="#a7f3d0" strokeWidth="10" />
      <circle cx="46" cy="40" r="26" fill="none" stroke="#059669" strokeWidth="10" strokeDasharray="98 163" strokeLinecap="round" transform="rotate(-90 46 40)" />
      <circle cx="46" cy="40" r="26" fill="none" stroke="#10b981" strokeWidth="10" strokeDasharray="45 163" strokeDashoffset="-98" strokeLinecap="round" transform="rotate(-90 46 40)" />
      <rect x="100" y="46" width="12" height="20" rx="2.5" fill="#6ee7b7" />
      <rect x="118" y="34" width="12" height="32" rx="2.5" fill="#34d399" />
      <rect x="136" y="24" width="12" height="42" rx="2.5" fill="#10b981" />
      <rect x="154" y="40" width="12" height="26" rx="2.5" fill="#059669" />
    </Shell>
  );
}

function RecipeBoxCover({ className }: CoverProps) {
  return (
    <Shell id="recipe" bg={["#fff7ed", "#ffedd5"] as [string, string]} className={className}>
      <rect x="16" y="12" width="56" height="56" rx="8" fill="#ffffff" />
      <rect x="22" y="18" width="44" height="26" rx="5" fill="#fdba74" />
      <circle cx="34" cy="30" r="5" fill="#fed7aa" />
      <path d="M46 36 L58 36 L52 26 Z" fill="#fb923c" opacity="0.8" />
      <rect x="22" y="49" width="30" height="3" rx="1.5" fill="#fdba74" />
      <rect x="22" y="56" width="20" height="3" rx="1.5" fill="#fed7aa" />
      <rect x="82" y="14" width="104" height="52" rx="6" fill="#ffffff" fillOpacity="0.85" />
      <rect x="90" y="22" width="34" height="4" rx="2" fill="#c2410c" />
      <circle cx="94" cy="35" r="2.5" fill="#fb923c" />
      <rect x="100" y="33" width="70" height="3" rx="1.5" fill="#fed7aa" />
      <circle cx="94" cy="45" r="2.5" fill="#fb923c" />
      <rect x="100" y="43" width="60" height="3" rx="1.5" fill="#fed7aa" />
      <circle cx="94" cy="55" r="2.5" fill="#fb923c" />
      <rect x="100" y="53" width="65" height="3" rx="1.5" fill="#fed7aa" />
    </Shell>
  );
}

function LinkInBioCover({ className }: CoverProps) {
  return (
    <Shell id="linkbio" bg={["#fdf2f8", "#fce7f3"] as [string, string]} className={className}>
      <rect x="70" y="8" width="60" height="64" rx="10" fill="#ffffff" />
      <circle cx="100" cy="22" r="7" fill="#f472b6" />
      <rect x="88" y="33" width="24" height="3" rx="1.5" fill="#f9a8d4" />
      <rect x="80" y="41" width="40" height="7" rx="3.5" fill="#fbcfe8" />
      <rect x="80" y="51" width="40" height="7" rx="3.5" fill="#f9a8d4" />
      <rect x="80" y="61" width="40" height="7" rx="3.5" fill="#fbcfe8" />
    </Shell>
  );
}

function TriviaQuizCover({ className }: CoverProps) {
  return (
    <Shell id="trivia" bg={["#fef2f2", "#fee2e2"] as [string, string]} className={className}>
      <rect x="16" y="12" width="168" height="16" rx="8" fill="#fecaca" />
      <rect x="16" y="12" width="104" height="16" rx="8" fill="#ef4444" />
      <rect x="16" y="36" width="82" height="16" rx="8" fill="#ffffff" />
      <rect x="106" y="36" width="82" height="16" rx="8" fill="#22c55e" />
      <rect x="16" y="56" width="82" height="16" rx="8" fill="#ffffff" />
      <rect x="106" y="56" width="82" height="16" rx="8" fill="#ffffff" />
    </Shell>
  );
}

function PomodoroTimerCover({ className }: CoverProps) {
  return (
    <Shell id="pomodoro" bg={["#fff1f2", "#ffe4e6"] as [string, string]} className={className}>
      <circle cx="100" cy="40" r="27" fill="none" stroke="#fecdd3" strokeWidth="7" />
      <circle
        cx="100"
        cy="40"
        r="27"
        fill="none"
        stroke="#e11d48"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="127 170"
        transform="rotate(-90 100 40)"
      />
      <rect x="90" y="35" width="20" height="4" rx="2" fill="#e11d48" />
      <rect x="90" y="42" width="14" height="4" rx="2" fill="#fb7185" />
    </Shell>
  );
}

function InventoryTrackerCover({ className }: CoverProps) {
  return (
    <Shell id="inventory" bg={["#f0fdfa", "#ccfbf1"] as [string, string]} className={className}>
      <g transform="translate(24,44)">
        <polygon points="0,-8 14,-15 28,-8 28,10 14,17 0,10" fill="#5eead4" stroke="#0d9488" strokeWidth="1.2" />
        <polygon points="0,-8 14,-1 28,-8 14,-15" fill="#99f6e4" />
      </g>
      <g transform="translate(60,50)">
        <polygon points="0,-8 14,-15 28,-8 28,10 14,17 0,10" fill="#2dd4bf" stroke="#0d9488" strokeWidth="1.2" />
        <polygon points="0,-8 14,-1 28,-8 14,-15" fill="#5eead4" />
      </g>
      <rect x="112" y="18" width="62" height="48" rx="6" fill="#ffffff" />
      <rect x="120" y="26" width="30" height="4" rx="2" fill="#0f766e" />
      <rect x="120" y="36" width="46" height="3" rx="1.5" fill="#99f6e4" />
      <rect x="120" y="43" width="46" height="3" rx="1.5" fill="#99f6e4" />
      <rect x="120" y="50" width="30" height="3" rx="1.5" fill="#fca5a5" />
      <rect x="120" y="57" width="20" height="6" rx="3" fill="#f97316" opacity="0.85" />
    </Shell>
  );
}

function PtoTrackerCover({ className }: CoverProps) {
  const days = [0, 1, 1, 0, 2, 0, 0, 0, 1, 0, 0, 3, 0, 0, 1, 0, 2, 0, 0, 0, 1];
  const colors = ["#e0f2fe", "#7dd3fc", "#38bdf8", "#0284c7"];
  const cols = 7;
  const cell = 12;
  const gap = 3;
  const startX = 18;
  const startY = 12;
  return (
    <Shell id="pto" bg={["#f0f9ff", "#e0f2fe"] as [string, string]} className={className}>
      {days.map((level, i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        return (
          <rect
            key={i}
            x={startX + c * (cell + gap)}
            y={startY + r * (cell + gap)}
            width={cell}
            height={cell}
            rx={3}
            fill={colors[level]}
          />
        );
      })}
    </Shell>
  );
}

/** Keyed by lib/templates.ts' AppTemplate.id — see TemplateCard in
 * components/templates-section.tsx for where this is consumed. */
export const TEMPLATE_COVERS: Record<string, (props: CoverProps) => JSX.Element> = {
  "habit-tracker": HabitTrackerCover,
  "markdown-notes": MarkdownNotesCover,
  "invoice-generator": InvoiceGeneratorCover,
  "team-standup": TeamStandupCover,
  "mini-crm": MiniCrmCover,
  "budget-tracker": BudgetTrackerCover,
  "recipe-box": RecipeBoxCover,
  "link-in-bio": LinkInBioCover,
  "trivia-quiz": TriviaQuizCover,
  "pomodoro-timer": PomodoroTimerCover,
  "inventory-tracker": InventoryTrackerCover,
  "pto-tracker": PtoTrackerCover,
};
