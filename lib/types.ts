export type Provider = "anthropic" | "google" | "groq";

export type ModelId =
  | "haiku"
  | "gemini-flash"
  | "groq-llama-8b"
  | "sonnet"
  | "gemini-pro"
  | "groq-llama-70b"
  | "opus"
  | "groq-gpt-oss-120b";

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

// Credit costs are deliberately limited to 0.50 / 1.00 / 1.50 / 2.00.
// firestore.rules validates every credit deduction against exactly this
// set, so adding a new cost value here means updating isValidCost() in the
// rules too.
//
// 1.0 is the floor for every model tier (nothing is priced at 0.5 anymore):
// 0.5 undercharged relative to real provider cost on longer generations,
// so the whole tier was raised to keep every model's actual API cost safely
// under what a credit is sold for. The 0.5 value stays valid in
// firestore.rules only for the flat clarify-question fee below, which does
// no generation at all.
export const MODEL_INFO: Record<ModelId, ModelInfo> = {
  haiku: {
    label: "Haiku 4.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    description: "Fast and inexpensive. Great for simple apps and quick iterations.",
    credits: 1.0,
    apiModel: "claude-haiku-4-5",
    minPlan: "free",
    tier: "Included free",
  },
  "gemini-flash": {
    label: "Gemini 3.6 Flash",
    provider: "google",
    providerLabel: "Google",
    description: "Very fast with a large context window. Good for content-heavy apps.",
    credits: 1.0,
    apiModel: "gemini-3.6-flash",
    minPlan: "plus",
    tier: "Plus",
  },
  "groq-llama-8b": {
    label: "Llama 3.1 8B",
    provider: "groq",
    providerLabel: "Groq",
    description: "Near-instant inference on Groq's LPUs. Great for quick, simple apps.",
    credits: 1.0,
    apiModel: "llama-3.1-8b-instant",
    minPlan: "plus",
    tier: "Plus",
  },
  sonnet: {
    label: "Sonnet 4.5",
    provider: "anthropic",
    providerLabel: "Anthropic",
    description: "Balanced quality and speed. The best default for real applications.",
    // 1.5, not 1.0: at typical-to-max output token usage, Sonnet's actual
    // provider cost per credit is the highest of any model (higher than
    // Opus, whose 2.0 credit cost scales further with its higher price) —
    // on the Max plan's 32k output ceiling specifically, 1.0 credit could
    // cost more than the credit was sold for. See the cost analysis this
    // was based on for the full numbers.
    credits: 1.5,
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
    credits: 1.0,
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
  "groq-gpt-oss-120b": {
    label: "GPT-OSS 120B",
    provider: "groq",
    providerLabel: "Groq",
    description: "OpenAI's flagship open-weight model, with near-instant Groq inference.",
    credits: 1.0,
    apiModel: "openai/gpt-oss-120b",
    minPlan: "max",
    tier: "Max",
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
    price: "$85",
    period: "per month",
    description: "For scaling up production usage.",
    credits: 200,
    features: [
      "200.00 credits every month",
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

/** Lowest plan whose deployed apps get the visit-tracking snippet injected (see app/api/deploy). */
export const ANALYTICS_MIN_PLAN: PlanId = "pro";

/** Lowest plan that can import an existing GitHub repo as a new app. */
export const IMPORT_MIN_PLAN: PlanId = "plus";

/** Lowest plan that can attach a custom domain to a deployed app. */
export const CUSTOM_DOMAIN_MIN_PLAN: PlanId = "pro";

/**
 * Markup over Vercel's own wholesale registrar price when a user buys a new
 * domain through Breezify (see app/api/domains/purchase). Covers Stripe's
 * processing fee and the risk of a domain going unpurchased-but-non-
 * refundable if something fails after Vercel is charged.
 */
export const DOMAIN_PRICE_MARKUP = 1.2;

export function markedUpDomainPrice(wholesalePrice: number): number {
  return Math.round(wholesalePrice * DOMAIN_PRICE_MARKUP * 100) / 100;
}

/** Lowest plan that can invite collaborators onto an app. */
export const COLLABORATOR_MIN_PLAN: PlanId = "plus";

/**
 * Collaborators work on a shared app using their OWN credits, plan-gated
 * model access, and (for GitHub push/sync) their own connected GitHub
 * account — there's no pooled team billing yet, each person just brings
 * their own. This cap only limits how many people can be invited at once.
 */
export const MAX_COLLABORATORS: Record<PlanId, number> = {
  free: 0,
  plus: 5,
  pro: 15,
  max: 50,
};

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

// "deploying"/"live" used to double as this same field's deploy-lifecycle
// values, alongside "generating"/"ready"/"error"/"stopped" for the
// generation lifecycle — one field, two unrelated state machines sharing it.
// That meant a refine (which always writes "ready" on success) silently
// erased a "live" badge the moment you changed anything after deploying,
// even though the app was still actually live at its deployedUrl; and a
// deploy running concurrently with another collaborator's refine could have
// either one clobber the other's status update. Deploy state now lives in
// its own `deployStatus` field on FeatherApp below — see effectiveDeployStatus().
// "deploying"/"live" stay in this union (and unused in STATUS_CONFIG) purely
// so TypeScript doesn't choke on documents written before this split that
// may still carry one of those two values in `status`; see displayStatus().
export type AppStatus =
  | "generating"
  | "ready"
  | "deploying"
  | "live"
  | "error"
  | "stopped";

/** Sanitizes a possibly-legacy AppStatus for display — see the AppStatus doc comment. */
export function displayStatus(status: AppStatus): "generating" | "ready" | "error" | "stopped" {
  return status === "live" || status === "deploying" ? "ready" : status;
}

export type DeployStatus = "deploying" | "live" | "error";

/**
 * The deploy state to actually show, falling back to whatever a pre-split
 * document still has parked in `status` (see the AppStatus doc comment)
 * until its next deploy or refine gives it a real `deployStatus`.
 */
export function effectiveDeployStatus(app: {
  status: AppStatus;
  deployStatus?: DeployStatus;
}): DeployStatus | null {
  if (app.deployStatus) return app.deployStatus;
  if (app.status === "live") return "live";
  if (app.status === "deploying") return "deploying";
  return null;
}

export interface AppTurn {
  id: string;
  /**
   * "build" is the original generation, "refine" is a follow-up change,
   * "revert" restores an earlier version and costs nothing (no AI call),
   * "sync" pulls the latest commit from the linked GitHub repo, "edit" is a
   * hand edit made directly in the code panel (also free, no AI call).
   */
  kind: "build" | "refine" | "revert" | "sync" | "edit";
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
  /** Deploy lifecycle, independent of `status` — see effectiveDeployStatus(). */
  deployStatus?: DeployStatus;
  /** Set alongside deployStatus: "error" — kept separate from `errorMessage`, which is a generation failure's message. */
  deployErrorMessage?: string;
  /** uid of whoever's refine currently holds the generation lock on this app — see app/api/generate/route.ts. Cleared once that refine finishes, errors, or aborts. */
  generatingBy?: string;
  generatingByEmail?: string;
  generatingStartedAt?: number;
  summary?: string;
  suggestions?: string[];
  turns?: AppTurn[];
  deployedUrl?: string;
  githubUrl?: string;
  subdomain?: string;
  customDomain?: string;
  customDomainVerified?: boolean;
  /** True when this domain was bought through Breezify (see app/api/domains/purchase), not brought by the user. */
  domainPurchased?: boolean;
  domainExpiresAt?: number;
  /** Whether app/api/cron/renew-domains should try to renew this before it expires — toggle via app/api/domains/auto-renew. */
  domainAutoRenew?: boolean;
  /** The domainOrders/{id} this purchase came from — an opaque Stripe session id, not sensitive, safe for any viewer with read access to this app. */
  domainOrderId?: string;
  errorMessage?: string;
  createdAt: number;
  deployedAt?: number;
  /** Page-load count on the deployed app. */
  visits?: number;
}

/** A key/value pair scoped to one app, e.g. an API key the generated app calls out with. */
export interface AppSecret {
  id: string;
  key: string;
  value: string;
  createdAt: number;
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
