"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Catches a crash in the root layout itself (app/layout.tsx), which
// app/error.tsx cannot: that boundary is rendered inside the layout, so it
// never runs if the layout is what threw. This one replaces the entire
// document, so it has to render its own <html>/<body>.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
            padding: "1.5rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "#71717a" }}>
            Something broke
          </p>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>
            An unexpected error occurred
          </h1>
          <p style={{ maxWidth: "28rem", color: "#71717a" }}>
            This has been logged. Try again, or head back to the homepage.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
            <button
              onClick={reset}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                border: "1px solid #d4d4d8",
                background: "transparent",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                background: "#18181b",
                color: "#fff",
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
