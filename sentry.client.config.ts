// This file configures the initialization of Sentry on the client (browser).
// https://docs.sentry.io/platforms/javascript/guides/nextjs/
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// No-op until a DSN is actually configured — nothing here should ever break
// a deployment that hasn't set NEXT_PUBLIC_SENTRY_DSN.
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    debug: false,
  });
}
