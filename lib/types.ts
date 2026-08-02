export type Provider = "anthropic" | "google" | "groq";

export type ModelId =
  | "haiku"
  | "gemini-flash"
  | "groq-llama-8b"
  | "sonnet"
  | "gemini-pro"
  | "groq-llama-70b"
  | "opus";

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
  "groq-llama-8b": {
    label: "Llama 3.1 8B",
    provider: "groq",
    providerLabel: "Groq",
    description: "Near-instant inference on Groq's LPUs. Great for quick, simple apps.",
    credits: 0.5,
    apiModel: "llama-3.1-8b-instant",
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
  "groq-llama-70b": {
    label: "Llama 3.3 70B",
    provider: "groq",
    providerLabel: "Groq",
    description: "Near-instant responses with strong general reasoning.",
    credits: 0.5,
    apiModel: "llama-3.3-70b-versatile",
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

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === "string" && v in PLAN_RANK;
}

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
    credits: 40,
    features: [
      "40.00 credits every month",
      "Adds Sonnet 4.5, Gemini 3.6 Flash, and Llama 3.1 8B (Groq)",
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
    credits: 100,
    features: [
      "100.00 credits every month",
      "Adds Opus 5, Gemini 3.1 Pro, and Llama 3.3 70B (Groq)",
      "Duplicate any app to experiment freely",
      "Visit analytics on deployed apps",
      "Priority support",
    ],
  },
  max: {
    id: "max",
    name: "Max",
    price: "$200",
    period: "per month",
    description: "For scaling up production usage.",
    credits: 500,
    features: [
      "500.00 credits every month",
      "Every model",
      "Larger token budget per generation",
      "Duplicate any app to experiment freely",
      "Dedicated support",
    ],
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/**
 * Max characters allowed in a single generate/refine prompt, including any
 * attached-file context the client appends. Scales with plan so a free
 * account can't submit a huge prompt against the platform's own API key.
 */
export const PROMPT_CHAR_LIMIT: Record<PlanId, number> = {
  free: 500,
  plus: 2000,
  pro: 5000,
  max: 10000,
};

/** Lowest plan that can duplicate an app (a real perk: costs nothing to offer, no AI call involved). */
export const DUPLICATE_MIN_PLAN: PlanId = "pro";

/** Lowest plan that can import an existing GitHub repo as a new app. */
export const IMPORT_MIN_PLAN: PlanId = "plus";

/**
 * Deploys don't cost credits (they're a Vercel build/bandwidth cost, not an
 * AI cost), so without a separate cap a free account could redeploy
 * unlimited times a day at zero cost to them. Capped per plan instead of
 * charged, since normal iteration (redeploying the same app repeatedly)
 * shouldn't feel metered.
 */
export const DEPLOY_DAILY_LIMIT: Record<PlanId, number> = {
  free: 10,
  plus: 30,
  pro: 75,
  max: 200,
};

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
  /**
   * "build" is the original generation, "refine" is a follow-up change,
   * "revert" restores an earlier version and costs nothing (no AI call).
   */
  kind: "build" | "refine" | "revert";
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
  /** Page-load count on the deployed app. Only tracked for Pro+ owners. */
  visits?: number;
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
