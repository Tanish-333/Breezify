/**
 * Small inline-SVG "cover art" for each template card in
 * components/templates-section.tsx — a tiny wireframe/blueprint sketch of
 * that template's actual UI, rendered on top of the card's existing
 * gradient backdrop (template.gradient). Kept strictly monochrome: every
 * shape is filled/stroked with `foreground/<opacity>` (see app/globals.css'
 * grayscale --foreground token and templates-section.tsx's existing
 * `text-foreground/70` usage for the same convention), no new hues.
 *
 * Each cover is its own tiny function component built from rect/circle/line
 * primitives on a `viewBox="0 0 160 80"` canvas, which lines up with the
 * card hero's `h-20` (80px) height at any card width.
 */

import type { ReactNode } from "react";

function HabitTrackerCover() {
  const cols = 8;
  const rows = 3;
  const cell = 8;
  const gap = 3;
  const gridW = cols * cell + (cols - 1) * gap;
  const startX = (160 - gridW) / 2;
  // Deterministic pseudo-random-looking opacity per cell for a heatmap feel.
  const seed = [
    2, 4, 1, 5, 3, 2, 4, 1, 3, 5, 2, 1, 4, 3, 2, 5, 1, 3, 4, 2, 5, 2, 1, 3,
  ];
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      {/* checklist row */}
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${28 + i * 38}, 16)`}>
          <rect
            x={0}
            y={0}
            width={10}
            height={10}
            rx={3}
            className={i === 1 ? "fill-foreground/50" : "fill-none stroke-foreground/40"}
            strokeWidth={1.5}
          />
          <rect x={16} y={3} width={18} height={4} rx={2} className="fill-foreground/30" />
        </g>
      ))}
      {/* heatmap grid */}
      <g transform={`translate(${startX}, 38)`}>
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const idx = (r * cols + c) % seed.length;
            const level = seed[idx];
            const opacity = [0.08, 0.18, 0.3, 0.45, 0.65][level] ?? 0.2;
            return (
              <rect
                key={`${r}-${c}`}
                x={c * (cell + gap)}
                y={r * (cell + gap)}
                width={cell}
                height={cell}
                rx={2}
                style={{ fill: `hsl(var(--foreground) / ${opacity})` }}
              />
            );
          })
        )}
      </g>
    </svg>
  );
}

function MarkdownNotesCover() {
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      {/* sidebar */}
      <rect x={14} y={14} width={40} height={52} rx={4} className="fill-foreground/[0.06]" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={20}
          y={22 + i * 11}
          width={i === 1 ? 22 : 28}
          height={5}
          rx={2}
          className={i === 1 ? "fill-foreground/40" : "fill-foreground/20"}
        />
      ))}
      {/* main pane */}
      <rect x={62} y={14} width={84} height={52} rx={4} className="fill-foreground/[0.04]" />
      <rect x={70} y={22} width={40} height={6} rx={2} className="fill-foreground/40" />
      {[0, 1, 2, 3].map((i) => (
        <rect
          key={i}
          x={70}
          y={36 + i * 8}
          width={68 - (i % 2) * 14}
          height={4}
          rx={2}
          className="fill-foreground/20"
        />
      ))}
    </svg>
  );
}

function InvoiceGeneratorCover() {
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      <rect x={34} y={10} width={92} height={60} rx={4} className="fill-foreground/[0.05]" />
      {/* header */}
      <rect x={44} y={18} width={34} height={6} rx={2} className="fill-foreground/45" />
      <rect x={100} y={18} width={16} height={6} rx={2} className="fill-foreground/25" />
      <line x1={44} y1={30} x2={116} y2={30} className="stroke-foreground/15" strokeWidth={1} />
      {/* line items */}
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={44} y={36 + i * 8} width={38} height={4} rx={2} className="fill-foreground/25" />
          <rect x={104} y={36 + i * 8} width={12} height={4} rx={2} className="fill-foreground/25" />
        </g>
      ))}
      <line x1={44} y1={61} x2={116} y2={61} className="stroke-foreground/15" strokeWidth={1} />
      {/* total, right-aligned and bold */}
      <rect x={90} y={65} width={26} height={5} rx={2} className="fill-foreground/60" />
    </svg>
  );
}

function TeamStandupCover() {
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(38, ${12 + i * 20})`}>
          <circle cx={7} cy={7} r={7} className={i === 0 ? "fill-foreground/45" : "fill-foreground/25"} />
          <rect x={22} y={2} width={62} height={5} rx={2} className="fill-foreground/30" />
          <rect x={22} y={11} width={44} height={4} rx={2} className="fill-foreground/18" />
        </g>
      ))}
    </svg>
  );
}

function kanbanBoard(cardAccent: (col: number, row: number) => ReactNode) {
  const cols = 3;
  const colW = 34;
  const gap = 8;
  const boardW = cols * colW + (cols - 1) * gap;
  const startX = (160 - boardW) / 2;
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      {Array.from({ length: cols }).map((_, c) => (
        <g key={c} transform={`translate(${startX + c * (colW + gap)}, 10)`}>
          <rect x={0} y={0} width={colW} height={5} rx={2} className="fill-foreground/35" />
          {[0, 1].map((r) => (
            <g key={r} transform={`translate(0, ${11 + r * 26})`}>
              <rect x={0} y={0} width={colW} height={21} rx={3} className="fill-foreground/[0.07]" />
              {cardAccent(c, r)}
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

function MiniCrmCover() {
  return kanbanBoard(() => (
    <>
      <rect x={4} y={4} width={20} height={4} rx={2} className="fill-foreground/28" />
      <rect x={4} y={11} width={14} height={4} rx={2} className="fill-foreground/18" />
      {/* small solid value tag, bottom-right of card — distinct from
          applicant-tracker's row of rating dots below */}
      <rect x={20} y={14.5} width={10} height={5} rx={2.5} className="fill-foreground/45" />
    </>
  ));
}

function ApplicantTrackerCover() {
  return kanbanBoard(() => (
    <>
      <circle cx={7} cy={7} r={4} className="fill-foreground/35" />
      <rect x={14} y={4} width={16} height={4} rx={2} className="fill-foreground/25" />
      {/* rating dots instead of a $ tag */}
      {[0, 1, 2].map((s) => (
        <circle
          key={s}
          cx={14 + s * 5}
          cy={15}
          r={1.4}
          className={s < 2 ? "fill-foreground/45" : "fill-foreground/15"}
        />
      ))}
    </>
  ));
}

function BudgetTrackerCover() {
  const heights = [18, 28, 14, 24, 10];
  const barW = 10;
  const gap = 6;
  const totalW = heights.length * barW + (heights.length - 1) * gap;
  const startX = (160 - totalW) / 2;
  const baseline = 50;
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      {heights.map((h, i) => (
        <rect
          key={i}
          x={startX + i * (barW + gap)}
          y={baseline - h}
          width={barW}
          height={h}
          rx={2}
          className={i === 1 ? "fill-foreground/50" : "fill-foreground/25"}
        />
      ))}
      <line x1={startX} y1={baseline} x2={startX + totalW} y2={baseline} className="stroke-foreground/15" strokeWidth={1} />
      {/* progress bar */}
      <rect x={startX} y={62} width={totalW} height={7} rx={3.5} className="fill-foreground/[0.08]" />
      <rect x={startX} y={62} width={totalW * 0.62} height={7} rx={3.5} className="fill-foreground/45" />
    </svg>
  );
}

function RecipeBoxCover() {
  const cardW = 34;
  const cardH = 22;
  const gapX = 10;
  const gapY = 6;
  const gridW = cardW * 2 + gapX;
  const startX = (160 - gridW) / 2;
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      {[0, 1].map((r) =>
        [0, 1].map((c) => (
          <g key={`${r}-${c}`} transform={`translate(${startX + c * (cardW + gapX)}, ${8 + r * (cardH + gapY)})`}>
            <rect x={0} y={0} width={cardW} height={cardH - 6} rx={3} className="fill-foreground/[0.1]" />
            <rect x={0} y={cardH - 4} width={cardW - 8} height={4} rx={2} className="fill-foreground/25" />
          </g>
        ))
      )}
    </svg>
  );
}

function LinkInBioCover() {
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      <rect x={62} y={6} width={36} height={68} rx={10} className="fill-none stroke-foreground/25" strokeWidth={1.5} />
      <circle cx={80} cy={20} r={7} className="fill-foreground/40" />
      {[0, 1, 2].map((i) => (
        <rect
          key={i}
          x={68}
          y={33 + i * 12}
          width={24}
          height={8}
          rx={4}
          className={i === 0 ? "fill-foreground/40" : "fill-foreground/22"}
        />
      ))}
    </svg>
  );
}

function TriviaQuizCover() {
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      <rect x={36} y={8} width={88} height={26} rx={5} className="fill-foreground/[0.09]" />
      <rect x={46} y={16} width={54} height={5} rx={2} className="fill-foreground/40" />
      <rect x={46} y={25} width={34} height={4} rx={2} className="fill-foreground/22" />
      {[0, 1, 2, 3].map((i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        return (
          <rect
            key={i}
            x={44 + col * 44}
            y={42 + row * 15}
            width={38}
            height={11}
            rx={5.5}
            className={i === 0 ? "fill-foreground/32" : "fill-foreground/[0.08]"}
          />
        );
      })}
    </svg>
  );
}

function PomodoroTimerCover() {
  const cx = 80;
  const cy = 40;
  const r = 24;
  const circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      <circle cx={cx} cy={cy} r={r} className="fill-none stroke-foreground/12" strokeWidth={5} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        className="fill-none stroke-foreground/50"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={`${circumference * 0.68} ${circumference}`}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <path d={`M ${cx - 5} ${cy - 7} L ${cx - 5} ${cy + 7} L ${cx + 8} ${cy} Z`} className="fill-foreground/55" />
    </svg>
  );
}

function SupportDeskCover() {
  return (
    <svg viewBox="0 0 160 80" className="h-full w-full">
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(16, ${12 + i * 17})`}>
          <circle
            cx={4}
            cy={6}
            r={3.5}
            className={i === 0 ? "fill-foreground/55" : i === 1 ? "fill-foreground/32" : "fill-foreground/18"}
          />
          <rect x={14} y={2} width={56} height={5} rx={2} className="fill-foreground/28" />
          <rect x={14} y={10} width={38} height={4} rx={2} className="fill-foreground/16" />
        </g>
      ))}
      {/* reply thread accent: a small chat bubble */}
      <g transform="translate(112, 30)">
        <rect x={0} y={0} width={32} height={20} rx={5} className="fill-foreground/[0.1]" />
        <path d="M 6 20 L 6 26 L 13 20 Z" className="fill-foreground/[0.1]" />
        <rect x={6} y={6} width={20} height={3} rx={1.5} className="fill-foreground/30" />
        <rect x={6} y={12} width={14} height={3} rx={1.5} className="fill-foreground/20" />
      </g>
    </svg>
  );
}

const COVERS: Record<string, () => ReactNode> = {
  "habit-tracker": HabitTrackerCover,
  "markdown-notes": MarkdownNotesCover,
  "invoice-generator": InvoiceGeneratorCover,
  "team-standup": TeamStandupCover,
  "mini-crm": MiniCrmCover,
  "support-desk": SupportDeskCover,
  "applicant-tracker": ApplicantTrackerCover,
  "budget-tracker": BudgetTrackerCover,
  "recipe-box": RecipeBoxCover,
  "link-in-bio": LinkInBioCover,
  "trivia-quiz": TriviaQuizCover,
  "pomodoro-timer": PomodoroTimerCover,
};

/**
 * Looks up and renders the small illustrated wireframe cover for a
 * template id (see COVERS above). Renders nothing for unknown ids so
 * callers can gracefully fall back to `template.icon`.
 */
export function TemplateCover({ id }: { id: string }) {
  const Cover = COVERS[id];
  if (!Cover) return null;
  return <Cover />;
}

/** Whether TemplateCover has a real illustration for this id, so callers
 * (e.g. templates-section.tsx's TemplateCard) know when to fall back to
 * template.icon instead. */
export function hasTemplateCover(id: string): boolean {
  return id in COVERS;
}
