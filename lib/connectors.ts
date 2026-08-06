import type { LucideIcon } from "lucide-react";
import { Bot, CreditCard, FileSpreadsheet, Mail, MessageSquare, Sparkles, Table2, Wand2 } from "lucide-react";

/**
 * One env var a connector needs. Storage is unchanged from the plain
 * key/value Secrets panel this replaces the UI for — each field still
 * lands as its own row in apps/{appId}/secrets, keyed by `key` exactly as
 * the generated backend reads it via process.env.<key> (see the matching
 * recipe for each connector in lib/generation/prompt.ts's SYSTEM_PROMPT).
 */
export interface ConnectorField {
  key: string;
  label: string;
  placeholder?: string;
  /** Masked input, like a password field. Defaults to true — most connector fields are secret; a couple (a Stripe publishable key, a Twilio SID) aren't. */
  secret?: boolean;
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  fields: ConnectorField[];
  docsUrl: string;
  docsLabel: string;
}

/**
 * Phase 1 only: connectors where "connecting" is just pasting an API key
 * the app owner already has — functionally the same write as the old
 * freeform Secrets form, just with per-service guided fields instead of a
 * blank key/value pair. Real OAuth connections (Slack, Notion, Airtable/
 * Google beyond a read-only key) are a separate, larger effort — each needs
 * its own Breezify-owned OAuth client, same shape as the existing generated-
 * app Google sign-in — and aren't built here.
 */
export const CONNECTORS: Connector[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept payments and manage subscriptions.",
    icon: CreditCard,
    fields: [
      { key: "STRIPE_PUBLISHABLE_KEY", label: "Publishable key", placeholder: "pk_live_...", secret: false },
      { key: "STRIPE_SECRET_KEY", label: "Secret key", placeholder: "sk_live_..." },
    ],
    docsUrl: "https://dashboard.stripe.com/apikeys",
    docsLabel: "Get your keys from Stripe",
  },
  {
    id: "resend",
    name: "Resend",
    description: "Send transactional email from this app's backend.",
    icon: Mail,
    fields: [{ key: "RESEND_API_KEY", label: "API key", placeholder: "re_..." }],
    docsUrl: "https://resend.com/api-keys",
    docsLabel: "Get your key from Resend",
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "Send SMS messages.",
    icon: MessageSquare,
    fields: [
      { key: "TWILIO_ACCOUNT_SID", label: "Account SID", placeholder: "AC...", secret: false },
      { key: "TWILIO_AUTH_TOKEN", label: "Auth token" },
    ],
    docsUrl: "https://console.twilio.com",
    docsLabel: "Get your credentials from Twilio",
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "Add AI features backed by GPT models.",
    icon: Bot,
    fields: [{ key: "OPENAI_API_KEY", label: "API key", placeholder: "sk-..." }],
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "Get your key from OpenAI",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Add AI features backed by Claude models.",
    icon: Sparkles,
    fields: [{ key: "ANTHROPIC_API_KEY", label: "API key", placeholder: "sk-ant-..." }],
    docsUrl: "https://console.anthropic.com/settings/keys",
    docsLabel: "Get your key from Anthropic",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Add AI features backed by Gemini models.",
    icon: Wand2,
    fields: [{ key: "GEMINI_API_KEY", label: "API key", placeholder: "AIza..." }],
    docsUrl: "https://aistudio.google.com/apikey",
    docsLabel: "Get your key from Google AI Studio",
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Read and write records in an Airtable base.",
    icon: Table2,
    fields: [{ key: "AIRTABLE_API_KEY", label: "Personal access token", placeholder: "pat..." }],
    docsUrl: "https://airtable.com/create/tokens",
    docsLabel: "Create a token on Airtable",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Read data from a public Google Sheet.",
    icon: FileSpreadsheet,
    fields: [{ key: "GOOGLE_SHEETS_API_KEY", label: "API key", placeholder: "AIza..." }],
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    docsLabel: "Create an API key on Google Cloud",
  },
];

export function connectorForKey(key: string): Connector | undefined {
  return CONNECTORS.find((c) => c.fields.some((f) => f.key === key));
}
