"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
    // The copy below says "this has been logged" — make that true instead
    // of just a console.error only the person with devtools open ever sees.
    Sentry.captureException(error);
  }, [error]);

  return (
    <div>
      <SiteHeader />
      <div className="container flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-sm font-medium text-muted-foreground">Something broke</p>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          An unexpected error occurred
        </h1>
        <p className="max-w-md text-muted-foreground">
          This has been logged. Try again, or head back to the dashboard.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={reset} variant="secondary">
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
          <Link href="/dashboard">
            <Button>Go to dashboard</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
