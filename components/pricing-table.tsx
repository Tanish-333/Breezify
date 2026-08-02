import {
  DUPLICATE_MIN_PLAN,
  PLANS,
  PLAN_IDS,
  PLAN_RANK,
  PROMPT_CHAR_LIMIT,
  type PlanId,
} from "@/lib/types";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type Cell = boolean | string;

interface Row {
  label: string;
  values: Record<PlanId, Cell>;
}

const MODELS: Record<PlanId, string> = {
  free: "Haiku 4.5",
  plus: "+ Sonnet 4.5, Gemini Flash, Llama 3.1 8B (Groq)",
  pro: "+ Opus 5, Gemini Pro, Llama 3.3 70B (Groq)",
  max: "Every model",
};

const SUPPORT: Record<PlanId, string> = {
  free: "Community",
  plus: "Email",
  pro: "Priority",
  max: "Dedicated",
};

const ROWS: Row[] = [
  {
    label: "Credits",
    values: {
      free: `${PLANS.free.credits.toFixed(2)}, one time`,
      plus: `${PLANS.plus.credits.toFixed(2)} / month`,
      pro: `${PLANS.pro.credits.toFixed(2)} / month`,
      max: `${PLANS.max.credits.toFixed(2)} / month`,
    },
  },
  {
    label: "Models",
    values: MODELS,
  },
  {
    label: "Prompt length limit",
    values: {
      free: `${PROMPT_CHAR_LIMIT.free.toLocaleString()} characters`,
      plus: `${PROMPT_CHAR_LIMIT.plus.toLocaleString()} characters`,
      pro: `${PROMPT_CHAR_LIMIT.pro.toLocaleString()} characters`,
      max: `${PROMPT_CHAR_LIMIT.max.toLocaleString()} characters`,
    },
  },
  {
    label: "Live preview",
    values: { free: true, plus: true, pro: true, max: true },
  },
  {
    label: "One-click deploy to a live URL",
    values: { free: true, plus: true, pro: true, max: true },
  },
  {
    label: "View & copy generated code",
    values: { free: false, plus: true, pro: true, max: true },
  },
  {
    label: "Download ZIP",
    values: { free: false, plus: true, pro: true, max: true },
  },
  {
    label: "Push to GitHub",
    values: { free: false, plus: true, pro: true, max: true },
  },
  {
    label: "Import an existing GitHub repo",
    values: { free: false, plus: true, pro: true, max: true },
  },
  {
    label: "No Breezify badge",
    values: { free: false, plus: true, pro: true, max: true },
  },
  {
    label: "Duplicate any app",
    values: {
      free: PLAN_RANK.free >= PLAN_RANK[DUPLICATE_MIN_PLAN],
      plus: PLAN_RANK.plus >= PLAN_RANK[DUPLICATE_MIN_PLAN],
      pro: PLAN_RANK.pro >= PLAN_RANK[DUPLICATE_MIN_PLAN],
      max: PLAN_RANK.max >= PLAN_RANK[DUPLICATE_MIN_PLAN],
    },
  },
  {
    label: "Deployed-app visit analytics",
    values: { free: false, plus: false, pro: true, max: true },
  },
  {
    label: "Larger generation token budget",
    values: { free: false, plus: false, pro: false, max: true },
  },
  {
    label: "Support",
    values: SUPPORT,
  },
];

function Cell({ value }: { value: Cell }) {
  if (typeof value === "string") {
    return <span className="text-sm text-foreground">{value}</span>;
  }
  return value ? (
    <Check className="mx-auto h-4 w-4 text-success" />
  ) : (
    <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
  );
}

export function PricingTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-3 pr-4 text-left font-medium text-muted-foreground">Feature</th>
            {PLAN_IDS.map((id) => (
              <th
                key={id}
                className={cn(
                  "px-4 py-3 text-center font-medium",
                  PLANS[id].highlighted ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {PLANS[id].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-border/60">
              <td className="py-3 pr-4 text-muted-foreground">{row.label}</td>
              {PLAN_IDS.map((id) => (
                <td key={id} className="px-4 py-3 text-center">
                  <Cell value={row.values[id]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
