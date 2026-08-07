// Next.js' instrumentation hook — the standard place @sentry/nextjs expects
// server/edge init to happen (stable since Next.js 14, no experimental flag
// needed). Without this file, sentry.server.config.ts/sentry.edge.config.ts
// exist but are never actually loaded, so no server-side error ever reaches
// Sentry regardless of what the API routes call.
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
