// Loaded by instrumentation.ts's register() when NEXT_RUNTIME === "nodejs".
// Same DSN/enabled guard as sentry.client.config.ts.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
