import {
  Bot,
  CreditCard,
  Mail,
  MessageSquare,
  Sheet,
  Sparkles,
  Table2,
  type LucideIcon,
} from "lucide-react";

export interface ConnectorField {
  /** Also the exact env var name a generated app's api/ backend reads it as — see lib/generation/prompt.ts's CONNECTORS recipe block. */
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "password";
}

export interface Connector {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  helpUrl: string;
  helpLabel: string;
  fields: ConnectorField[];
}

/**
 * Known API-key-based connectors for the build page's Connectors panel (see
 * components/app-secrets-dialog.tsx) — Phase 1 of the connectors
 * marketplace: the app owner just pastes their own key, same storage as the
 * plain key/value Secrets panel this replaced (apps/{appId}/secrets), just
 * with guided per-service UI instead of a freeform form. Real OAuth account
 * connections (Phase 2 — Slack, Notion, Airtable/Sheets with write access)
 * are a separate, larger effort requiring a Breezify-owned OAuth client per
 * service; not started here.
 *
 * Each field's `key` is the literal env var name a generated app's backend
 * must read via process.env — see lib/generation/prompt.ts's CONNECTORS
 * block, which tells the model to use these exact names so generated code
 * reliably matches what this panel actually stores.
 */
export const CONNECTORS: Connector[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept payments and manage subscriptions.",
    icon: CreditCard,
    helpUrl: "https://dashboard.stripe.com/apikeys",
    helpLabel: "dashboard.stripe.com/apikeys",
    fields: [
      { key: "STRIPE_PUBLISHABLE_KEY", label: "Publishable key", placeholder: "pk_live_...", type: "text" },
      { key: "STRIPE_SECRET_KEY", label: "Secret key", placeholder: "sk_live_...", type: "password" },
    ],
  },
  {
    id: "resend",
    name: "Resend",
    description: "Send transactional and marketing email.",
    icon: Mail,
    helpUrl: "https://resend.com/api-keys",
    helpLabel: "resend.com/api-keys",
    fields: [{ key: "RESEND_API_KEY", label: "API key", placeholder: "re_...", type: "password" }],
  },
  {
    id: "twilio",
    name: "Twilio",
    description: "Send SMS and other messages.",
    icon: MessageSquare,
    helpUrl: "https://console.twilio.com",
    helpLabel: "console.twilio.com",
    fields: [
      { key: "TWILIO_ACCOUNT_SID", label: "Account SID", placeholder: "AC...", type: "text" },
      { key: "TWILIO_AUTH_TOKEN", label: "Auth token", placeholder: "...", type: "password" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    description: "GPT models for chat, generation, and more.",
    icon: Sparkles,
    helpUrl: "https://platform.openai.com/api-keys",
    helpLabel: "platform.openai.com/api-keys",
    fields: [{ key: "OPENAI_API_KEY", label: "API key", placeholder: "sk-...", type: "password" }],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude models for chat, generation, and more.",
    icon: Bot,
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpLabel: "console.anthropic.com/settings/keys",
    fields: [{ key: "ANTHROPIC_API_KEY", label: "API key", placeholder: "sk-ant-...", type: "password" }],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini models for chat, generation, and more.",
    icon: Sparkles,
    helpUrl: "https://aistudio.google.com/apikey",
    helpLabel: "aistudio.google.com/apikey",
    fields: [{ key: "GEMINI_API_KEY", label: "API key", placeholder: "AIza...", type: "password" }],
  },
  {
    id: "airtable",
    name: "Airtable",
    description: "Read and write records in an Airtable base.",
    icon: Table2,
    helpUrl: "https://airtable.com/create/tokens",
    helpLabel: "airtable.com/create/tokens",
    fields: [{ key: "AIRTABLE_API_KEY", label: "Personal access token", placeholder: "pat...", type: "password" }],
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Read public sheets as a simple data source.",
    icon: Sheet,
    helpUrl: "https://console.cloud.google.com/apis/credentials",
    helpLabel: "console.cloud.google.com/apis/credentials",
    fields: [{ key: "GOOGLE_SHEETS_API_KEY", label: "API key", placeholder: "AIza...", type: "password" }],
  },
];
