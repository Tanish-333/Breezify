// Next.js' own client instrumentation convention (loaded automatically,
// Turbopack-compatible — the older sentry.client.config.ts is deprecated).
// A no-op when NEXT_PUBLIC_SENTRY_DSN isn't set, so this is safe to ship
// even before that env var exists — see lib/monitoring-config.ts, which
// the rest of the app already reads that same var from.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  // Session replay is off: this app's build pages render user-generated
  // app code and prompts, and replay would capture that DOM/text by
  // default — not worth the setup cost of scrubbing it right now.
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
