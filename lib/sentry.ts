// Sentry error tracking integration
// Set NEXT_PUBLIC_SENTRY_DSN environment variable to enable

export function initSentry() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    return;
  }

  // Dynamic import to avoid loading Sentry if DSN is not set
  import("@sentry/nextjs").then(({ init }) => {
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.1, // 10% for performance monitoring
      integrations: [
        // Additional Sentry integrations can be added here
      ],
    });
  });
}

export function captureException(error: Error, context?: Record<string, any>) {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    console.error("Error:", error, context);
    return;
  }

  import("@sentry/nextjs").then(({ captureException: capture }) => {
    capture(error, { contexts: { custom: context } });
  });
}

export function captureMessage(message: string, level: "fatal" | "error" | "warning" | "info" = "error") {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
    console.log(message);
    return;
  }

  import("@sentry/nextjs").then(({ captureMessage: capture }) => {
    capture(message, level);
  });
}
