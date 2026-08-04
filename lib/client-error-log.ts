// Client-side error logging
export function logClientError(
  error: Error | string,
  context?: Record<string, any>
) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  // Send to server for logging
  fetch("/api/errors", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      stack,
      context: context || {},
      level: "error",
    }),
    keepalive: true,
  }).catch(() => {
    // Silently fail - don't interrupt app
  });

  // Also log to console in development
  if (process.env.NODE_ENV === "development") {
    console.error(message, { stack, context });
  }
}

// Global error handler
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    logClientError(event.error, {
      type: "uncaught",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logClientError(event.reason, {
      type: "unhandledRejection",
    });
  });
}
