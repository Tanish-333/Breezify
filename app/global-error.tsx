"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * Catches errors thrown by the root layout itself — app/error.tsx only
 * catches errors below it, so a crash in app/layout.tsx (or anything it
 * renders unconditionally, e.g. providers) would otherwise show Next's
 * default unstyled error screen with nothing reported anywhere. Must
 * render its own <html>/<body> since it fully replaces the root layout
 * when triggered.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    console.error(error);
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ display: "flex", minHeight: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>Something broke</h1>
          <p style={{ color: "#666", maxWidth: 400 }}>
            This has been logged. Try refreshing the page.
          </p>
        </div>
      </body>
    </html>
  );
}
