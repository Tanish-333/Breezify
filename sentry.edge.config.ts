// Loaded by instrumentation.ts's register() when NEXT_RUNTIME === "edge"
// (middleware.ts runs here). Same DSN/enabled guard as the other two
// Sentry config files.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});
