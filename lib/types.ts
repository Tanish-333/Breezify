export type Provider = "anthropic" | "google";

export type ModelId = "haiku" | "gemini-flash" | "sonnet" | "gemini-pro" | "opus";

export type PlanId = "free" | "plus" | "pro" | "max";

export interface ModelInfo {
  label: string;
  provider: Provider;
  providerLabel: string;
  description: string;
  /** User-facing credit cost per generation. */
  credits: number;
  /** The exact model ID string sent to the provider's API. */
  apiModel: string;
  /** Lowest plan that unlocks this model. */
  minPlan: PlanId;
  tier: string;
}

// Credit costs are deliberately limited to 0.50 / 1.00 / 2.00. firestore.rules
// validates every credit deduction against exactly this set, so adding a new
// cost value here means updating isValidCost() in the rules too.
export const MODEL_INFO: Record<ModelId, ModelInfo> = {
  haiku: {
    label: "Haiku 4.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    description: "Fast and inexpensive. Great for simple apps and quick iterations.",
    credits: 0.5,
    apiModel: "claude-haiku-4-5",
    minPlan: "free",
    tier: "Included free",
  },
  "gemini-flash": {
    label: "Gemini 3.6 Flash",
    provider: "google",
    providerLabel: "Google",
    description: "Very fast with a large context window. Good for content-heavy apps.",
    credits: 0.5,
    apiModel: "gemini-3.6-flash",
    minPlan: "plus",
    tier: "Plus",
  },
  sonnet: {
    label: "Sonnet 4.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    description: "Balanced quality and speed. The best default for real applications.",
    credits: 1.0,
    apiModel: "claude-sonnet-4-5",
    minPlan: "plus",
    tier: "Plus",
  },
  "gemini-pro": {
    label: "Gemini 3.1 Pro",
    provider: "google",
    providerLabel: "Google",
    description: "Strong reasoning across long, multi-file codebases.",
    credits: 1.0,
    apiModel: "gemini-3.1-pro-preview",
    minPlan: "pro",
    tier: "Pro",
  },
  opus: {
    label: "Opus 5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    description: "Maximum quality reasoning. Best for complex, multi-part applications.",
    credits: 2.0,
    apiModel: "claude-opus-5",
    minPlan: "pro",
    tier: "Pro",
  },
};

export const MODEL_IDS = Object.keys(MODEL_INFO) as ModelId[];

export function isModelId(v: unknown): v is ModelId {
  return typeof v === "string" && v in MODEL_INFO;
}

export interface PlanInfo {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  description: string;
  /** Credits granted: one-time for free, per month for paid plans. */
  credits: number;
  features: string[];
  highlighted?: boolean;
}

export const PLAN_RANK: Record<PlanId, number> = {
  free: 0,
  plus: 1,
  pro: 2,
  max: 3,
};

export const PLANS: Record<PlanId, PlanInfo> = {
  free: {
    id: "free",
    name: "Free",
    price: "$0",
    period: "to start",
    description: "$5.00 in free credit, no card required.",
    credits: 5,
    features: [
      "5.00 credits, one time",
      "Haiku 4.5",
      "Live preview only",
      "Community support",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    price: "$20",
    period: "per month",
    description: "For builders shipping apps regularly.",
    credits: 25,
    features: [
      "25.00 credits every month",
      "Adds Sonnet 4.5 and Gemini 3.6 Flash",
      "View, copy & export code, badge-free",
      "Email support",
    ],
    highlighted: true,
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: "$50",
    period: "per month",
    description: "Every model, including the frontier ones.",
    credits: 70,
    features: [
      "70.00 credits every month",
      "Adds Opus 5 and Gemini 3.1 Pro",
      "Priority support",
    ],
  },
  max: {
    id: "max",
    name: "Max",
    price: "$200",
    period: "per month",
    description: "For scaling up production usage.",
    credits: 300,
    features: [
      "300.00 credits every month",
      "Every model",
      "Larger token budget per generation",
      "Dedicated support",
    ],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function planAllowsModel(plan: PlanId, model: ModelId): boolean {
  return PLAN_RANK[plan] >= PLAN_RANK[MODEL_INFO[model].minPlan];
}

/** Cheapest plan that unlocks the given model. */
export function requiredPlanFor(model: ModelId): PlanInfo {
  return PLANS[MODEL_INFO[model].minPlan];
}

export type AppStatus =
  | "generating"
  | "ready"
  | "deploying"
  | "live"
  | "error"
  | "stopped";

export interface AppTurn {
  id: string;
  /** "build" is the original generation; "refine" is a follow-up change. */
  kind: "build" | "refine";
  /** The user's words for this turn. */
  instruction: string;
  /** What the model says it did. */
  summary: string;
  model: ModelId;
  fileCount: number;
  createdAt: number;
}

export interface FeatherApp {
  id: string;
  userId: string;
  name: string;
  prompt: string;
  model: ModelId;
  generatedCode?: {
    frontend?: string;
    backend?: string;
    config?: string;
    files?: Record<string, string>;
  };
  status: AppStatus;
  summary?: string;
  suggestions?: string[];
  turns?: AppTurn[];
  deployedUrl?: string;
  githubUrl?: string;
  subdomain?: string;
  errorMessage?: string;
  createdAt: number;
  deployedAt?: number;
}

export interface FeatherUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  credits: number;
  plan: PlanId;
  createdAt: number;
  lastLoginAt: number;
  authProviders: string[];
}

export type TransactionType = "generation" | "topup" | "subscription";

export interface FeatherTransaction {
  id: string;
  userId: string;
  type: TransactionType;
  creditsUsed?: number;
  creditsAdded?: number;
  model?: ModelId;
  actualCostUSD?: number;
  createdAt: number;
}
