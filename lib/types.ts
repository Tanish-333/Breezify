export type ModelId = "haiku" | "sonnet" | "opus";

export const MODEL_INFO: Record<
  ModelId,
  { label: string; description: string; credits: number; apiModel: string; tier: string }
> = {
  haiku: {
    label: "Haiku 4.5",
    description: "Fast, free-tier friendly. Great for simple apps and prototypes.",
    credits: 0.5,
    apiModel: "claude-haiku-4-5-20251001",
    tier: "Default",
  },
  sonnet: {
    label: "Sonnet 4.5",
    description: "Balanced quality and speed. Best for most real applications.",
    credits: 1.0,
    apiModel: "claude-sonnet-4-5-20250929",
    tier: "Recommended",
  },
  opus: {
    label: "Opus 5",
    description: "Maximum quality reasoning. Best for complex, multi-part apps.",
    credits: 2.0,
    apiModel: "claude-opus-5-20251101",
    tier: "Premium",
  },
};

export type AppStatus =
  | "generating"
  | "ready"
  | "deploying"
  | "live"
  | "error"
  | "stopped";

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
  deployedUrl?: string;
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
  plan: "free" | "payg" | "pro";
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
