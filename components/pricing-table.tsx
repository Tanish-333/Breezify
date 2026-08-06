import {
  ANALYTICS_MIN_PLAN,
  CUSTOM_DOMAIN_MIN_PLAN,
  DEPLOY_EXPIRY_DAYS,
  DUPLICATE_MIN_PLAN,
  MAX_ACTIVE_DEPLOYED_APPS,
  MONTHLY_PAGE_VIEW_LIMIT,
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
  max: "+ GPT-OSS 120B (Groq)",
};

function formatViewLimit(limit: number | null): string {
  return limit === null ? "Unlimited" : `${limit.toLocaleString()} views`;
}

function formatAppCap(cap: number | null): string {
  return cap === null ? "Unlimited" : `${cap} at once`;
}

function formatExpiry(days: number | null): string {
  return days === null ? "Never" : `${days} days, renewable`;
}

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
    label: "Live app subdomains at once",
    values: {
      free: formatAppCap(MAX_ACTIVE_DEPLOYED_APPS.free),
      plus: formatAppCap(MAX_ACTIVE_DEPLOYED_APPS.plus),
      pro: formatAppCap(MAX_ACTIVE_DEPLOYED_APPS.pro),
      max: formatAppCap(MAX_ACTIVE_DEPLOYED_APPS.max),
    },
  },
  {
    label: "Real backend support (serverless functions)",
    values: { free: false, plus: true, pro: true, max: true },
  },
  {
    label: "Custom domain on a deployed app",
    values: {
      free: PLAN_RANK.free >= PLAN_RANK[CUSTOM_DOMAIN_MIN_PLAN],
      plus: PLAN_RANK.plus >= PLAN_RANK[CUSTOM_DOMAIN_MIN_PLAN],
      pro: PLAN_RANK.pro >= PLAN_RANK[CUSTOM_DOMAIN_MIN_PLAN],
      max: PLAN_RANK.max >= PLAN_RANK[CUSTOM_DOMAIN_MIN_PLAN],
    },
  },
  {
    label: "Traffic per app, monthly",
    values: {
      free: formatViewLimit(MONTHLY_PAGE_VIEW_LIMIT.free),
      plus: formatViewLimit(MONTHLY_PAGE_VIEW_LIMIT.plus),
      pro: formatViewLimit(MONTHLY_PAGE_VIEW_LIMIT.pro),
      max: formatViewLimit(MONTHLY_PAGE_VIEW_LIMIT.max),
    },
  },
  {
    label: "Subdomain expiry",
    values: {
      free: formatExpiry(DEPLOY_EXPIRY_DAYS.free),
      plus: formatExpiry(DEPLOY_EXPIRY_DAYS.plus),
      pro: formatExpiry(DEPLOY_EXPIRY_DAYS.pro),
      max: formatExpiry(DEPLOY_EXPIRY_DAYS.max),
    },
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
    values: {
      free: PLAN_RANK.free >= PLAN_RANK[ANALYTICS_MIN_PLAN],
      plus: PLAN_RANK.plus >= PLAN_RANK[ANALYTICS_MIN_PLAN],
      pro: PLAN_RANK.pro >= PLAN_RANK[ANALYTICS_MIN_PLAN],
      max: PLAN_RANK.max >= PLAN_RANK[ANALYTICS_MIN_PLAN],
    },
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
