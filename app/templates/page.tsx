"use client";

import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { TemplatesSection } from "@/components/templates-section";
import { useAuth } from "@/lib/auth-context";
import type { PlanId } from "@/lib/types";

function TemplatesContent() {
  const { profile } = useAuth();
  const plan: PlanId = profile?.plan ?? "free";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="py-10 text-center md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Templates</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Start from a real, working app instead of a blank prompt.
        </p>
      </div>

      <TemplatesSection plan={plan} variant="full" />
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <TemplatesContent />
      </AppShell>
    </ProtectedRoute>
  );
}
