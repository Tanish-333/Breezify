import type { LucideIcon } from "lucide-react";
import {
  AtSign,
  Bot,
  Brain,
  CloudSun,
  CreditCard,
  Database,
  FileSpreadsheet,
  Hash,
  HardDrive,
  Image,
  Layers,
  Mail,
  Map,
  MapPin,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Mic,
  Search,
  Send,
  Sparkles,
  Table2,
  Wallet,
  Wand2,
  Zap,
} from "lucide-react";

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

export type ConnectorCategory =
  | "Payments"
  | "Email"
  | "Messaging"
  | "AI"
  | "Data & storage"
  | "Maps & location"
  | "Marketing";

export interface Connector {
  id: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  icon: LucideIcon;
  fields: ConnectorField[];
  docsUrl: string;
  docsLabel: string;
}

/** Render order in the Connectors dialog — categories with zero matches (while searching) are simply skipped, not shown empty. */
export const CONNECTOR_CATEGORIES: ConnectorCategory[] = [
  "Payments",
  "Email",
  "Messaging",
  "AI",
  "Data & storage",
  "Maps & location",
  "Marketing",
];

/**
 * Phase 1 only: connectors where "connecting" is just pasting an API key
 * the app owner already has — functionally the same write as the old
 * freeform Secrets form, just with per-service guided fields instead of a
 * blank key/value form. Real OAuth connections (Slack, Notion, Airtable/
 * Google beyond a read-only key) are a separate, larger effort — each needs
 * its own Breezify-owned OAuth client — and aren't built here.
 */
export const CONNECTORS: Connector[] = [
  // Payments
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept payments and manage subscriptions.",
    category: "Payments",
    icon: CreditCard,
    fields: [
      { key: "STRIPE_PUBLISHABLE_KEY", label: "Publishable key", placeholder: "pk_live_...", secret: false },
      { key: "STRIPE_SECRET_KEY", label: "Secret key", placeholder: "sk_live_..." },
    ],
    docsUrl: "https://dashboard.stripe.com/apikeys",
    docsLabel: "Get your keys from Stripe",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Accept PayPal and card payments via checkout.",
    category: "Payments",
    icon: Wallet,
    fields: [
      { key: "PAYPAL_CLIENT_ID", label: "Client ID", secret: false },
      { key: "PAYPAL_CLIENT_SECRET", label: "Client secret" },
    ],
    docsUrl: "https://developer.paypal.com/dashboard/applications",
    docsLabel: "Get your credentials from PayPal",
  },
  {
    id: "square",
    name: "Square",
    description: "Accept card payments via Square's API.",
    category: "Payments",
    icon: CreditCard,
    fields: [{ key: "SQUARE_ACCESS_TOKEN", label: "Access token" }],
    docsUrl: "https://developer.squareup.com/apps",
    docsLabel: "Get your token from Square",
  },

  // Email
  {
    id: "resend",
    name: "Resend",
    description: "Send transactional email from this app's backend.",
    category: "Email",
    icon: Mail,
    fields: [{ key: "RESEND_API_KEY", label: "API key", placeholder: "re_..." }],
    docsUrl: "https://resend.com/api-keys",
    docsLabel: "Get your key from Resend",
  },
  {
    id: "sendgrid",
    name: "SendGrid",
    description: "Send transactional or marketing email.",
    category: "Email",
    icon: Send,
    fields: [{ key: "SENDGRID_API_KEY", label: "API key", placeholder: "SG...." }],
    docsUrl: "https://app.sendgrid.com/settings/api_keys",
    docsLabel: "Get your key from SendGrid",
  },
  {
    id: "mailgun",
    name: "Mailgun",
    description: "Send transactional email through a Mailgun domain.",
    category: "Email",
    icon: AtSign,
    fields: [
      { key: "MAILGUN_API_KEY", label: "API key" },
      { key: "MAILGUN_DOMAIN", label: "Sending domain", placeholder: "mg.yourdomain.com", secret: false },
    ],
    docsUrl: "https://app.mailgun.com/settings/api_security",
    docsLabel: "Get your key from Mailgun",
  },

  // Messaging
  {
    id: "twilio",
    name: "Twilio",
    description: "Send SMS messages.",
    category: "Messaging",
    icon: MessageSquare,
    fields: [
      { key: "TWILIO_ACCOUNT_SID", label: "Account SID", placeholder: "AC...", secret: false },
      { key: "TWILIO_AUTH_TOKEN", label: "Auth token" },
    ],
    docsUrl: "https://console.twilio.com",
    docsLabel: "Get your credentials from Twilio",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Send messages or run a bot via the Telegram Bot API.",
    category: "Messaging",
    icon: MessageCircle,
    fields: [{ key: "TELEGRAM_BOT_TOKEN", label: "Bot token" }],
    docsUrl: "https://core.telegram.org/bots/tutorial",
    docsLabel: "Create a bot with @BotFather",
  },
  {
    id: "discord",
    name: "Discord",
    description: "Post messages to a Discord channel.",
    category: "Messaging",
    icon: MessageSquare,
    fields: [{ key: "DISCORD_WEBHOOK_URL", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/..." }],
    docsUrl: "https://support.discord.com/hc/en-us/articles/228383668",
    docsLabel: "Create a webhook in Discord",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Post messages to a Slack channel.",
    category: "Messaging",
    icon: Hash,
    fields: [{ key: "SLACK_WEBHOOK_URL", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/..." }],
    docsUrl: "https://api.slack.com/messaging/webhooks",
    docsLabel: "Create a webhook in Slack",
  },

  // AI
  {
    id: "openai",
    name: "OpenAI",
    description: "Add AI features backed by GPT models.",
    category: "AI",
    icon: Bot,
    fields: [{ key: "OPENAI_API_KEY", label: "API key", placeholder: "sk-..." }],
    docsUrl: "https://platform.openai.com/api-keys",
    docsLabel: "Get your key from OpenAI",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    description: "Add AI features backed by Claude models.",
    category: "AI",
    icon: Sparkles,
    fields: [{ key: "ANTHROPIC_API_KEY", label: "API key", placeholder: "sk-ant-..." }],
    docsUrl: "https://console.anthropic.com/settings/keys",
    docsLabel: "Get your key from Anthropic",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    description: "Add AI features backed by Gemini models.",
    category: "AI",
    icon: Wand2,
    fields: [{ key: "GEMINI_API_KEY", label: "API key", placeholder: "AIza..." }],
    docsUrl: "https://aistudio.google.com/apikey",
    docsLabel: "Get your key from Google AI Studio",
  },
  {
    id: "cohere",
    name: "Cohere",
    description: "Add AI features backed by Cohere's language models.",
    category: "AI",
    icon: Brain,
    fields: [{ key: "COHERE_API_KEY", label: "API key" }],
    docsUrl: "https://dashboard.cohere.com/api-keys",
    docsLabel: "Get your key from Cohere",
  },
  {
    id: "mistral",
    name: "Mistral",
    description: "Add AI features backed by Mistral's language models.",
    category: "AI",
    icon: Zap,
    fields: [{ key: "MISTRAL_API_KEY", label: "API key" }],
    docsUrl: "https://console.mistral.ai/api-keys",
    docsLabel: "Get your key from Mistral",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "Generate realistic AI voice and speech.",
    category: "AI",
    icon: Mic,
    fields: [{ key: "ELEVENLABS_API_KEY", label: "API key" }],
    docsUrl: "https://elevenlabs.io/app/settings/api-keys",
    docsLabel: "Get your key from ElevenLabs",
  },
  {
    id: "perplexity",
    name: "Perplexity",
    description: "Add AI answers grounded in live web search.",
    category: "AI",
    icon: Search,
    fields: [{ key: "PERPLEXITY_API_KEY", label: "API key" }],
    docsUrl: "https://www.perplexity.ai/settings/api",
    docsLabel: "Get your key from Perplexity",
  },

  // Data & storage
  {
    id: "airtable",
    name: "Airtable",
    description: "Read and write records in an Airtable base.",
    category: "Data & storage",
    icon: Table2,
    fields: [{ key: "AIRTABLE_API_KEY", label: "Personal access token", placeholder: "pat..." }],
    docsUrl: "https://airtable.com/create/tokens",
    docsLabel: "Create a token on Airtable",
  },
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Read data from a public Google Sheet.",
    category: "Data & storage",
    icon: FileSpreadsheet,
    fields: [{ key: "GOOGLE_SHEETS_API_KEY", label: "API key", placeholder: "AIza..." }],
    docsUrl: "https://console.cloud.google.com/apis/credentials",
    docsLabel: "Create an API key on Google Cloud",
  },
  {
    id: "supabase",
    name: "Supabase",
    description: "A hosted Postgres database and backend.",
    category: "Data & storage",
    icon: Database,
    fields: [
      { key: "SUPABASE_URL", label: "Project URL", placeholder: "https://xxxxx.supabase.co", secret: false },
      { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Service role key" },
    ],
    docsUrl: "https://supabase.com/dashboard/project/_/settings/api",
    docsLabel: "Get your keys from Supabase",
  },
  {
    id: "upstash-redis",
    name: "Upstash Redis",
    description: "A serverless Redis store for caching or rate limiting.",
    category: "Data & storage",
    icon: Layers,
    fields: [
      { key: "UPSTASH_REDIS_REST_URL", label: "REST URL", secret: false },
      { key: "UPSTASH_REDIS_REST_TOKEN", label: "REST token" },
    ],
    docsUrl: "https://console.upstash.com",
    docsLabel: "Get your credentials from Upstash",
  },
  {
    id: "cloudinary",
    name: "Cloudinary",
    description: "Upload, host, and transform images and video.",
    category: "Data & storage",
    icon: Image,
    fields: [
      { key: "CLOUDINARY_CLOUD_NAME", label: "Cloud name", secret: false },
      { key: "CLOUDINARY_API_KEY", label: "API key", secret: false },
      { key: "CLOUDINARY_API_SECRET", label: "API secret" },
    ],
    docsUrl: "https://console.cloudinary.com/settings/api-keys",
    docsLabel: "Get your credentials from Cloudinary",
  },
  {
    id: "aws-s3",
    name: "AWS S3",
    description: "Upload and store files in an S3 bucket.",
    category: "Data & storage",
    icon: HardDrive,
    fields: [
      { key: "AWS_ACCESS_KEY_ID", label: "Access key ID", secret: false },
      { key: "AWS_SECRET_ACCESS_KEY", label: "Secret access key" },
      { key: "AWS_REGION", label: "Region", placeholder: "us-east-1", secret: false },
    ],
    docsUrl: "https://console.aws.amazon.com/iam/home#/security_credentials",
    docsLabel: "Get your credentials from AWS",
  },

  // Maps & location
  {
    id: "google-maps",
    name: "Google Maps",
    description: "Embed maps, geocoding, or places search.",
    category: "Maps & location",
    icon: MapPin,
    fields: [{ key: "GOOGLE_MAPS_API_KEY", label: "API key", placeholder: "AIza..." }],
    docsUrl: "https://console.cloud.google.com/google/maps-apis/credentials",
    docsLabel: "Create a key on Google Cloud",
  },
  {
    id: "mapbox",
    name: "Mapbox",
    description: "Embed custom maps and location search.",
    category: "Maps & location",
    icon: Map,
    fields: [{ key: "MAPBOX_ACCESS_TOKEN", label: "Access token", placeholder: "pk...." }],
    docsUrl: "https://account.mapbox.com/access-tokens",
    docsLabel: "Get your token from Mapbox",
  },
  {
    id: "openweather",
    name: "OpenWeather",
    description: "Show live weather and forecast data.",
    category: "Maps & location",
    icon: CloudSun,
    fields: [{ key: "OPENWEATHER_API_KEY", label: "API key" }],
    docsUrl: "https://home.openweathermap.org/api_keys",
    docsLabel: "Get your key from OpenWeather",
  },

  // Marketing
  {
    id: "mailchimp",
    name: "Mailchimp",
    description: "Add subscribers to an email marketing list.",
    category: "Marketing",
    icon: Megaphone,
    fields: [
      { key: "MAILCHIMP_API_KEY", label: "API key" },
      { key: "MAILCHIMP_SERVER_PREFIX", label: "Server prefix", placeholder: "us21", secret: false },
    ],
    docsUrl: "https://admin.mailchimp.com/account/api/",
    docsLabel: "Get your key from Mailchimp",
  },
];

export function connectorForKey(key: string): Connector | undefined {
  return CONNECTORS.find((c) => c.fields.some((f) => f.key === key));
}
