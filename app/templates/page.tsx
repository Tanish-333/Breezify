"use client";

import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { TemplatesSection } from "@/components/templates-section";
import { useAuth } from "@/lib/auth-context";
import { setPendingPrompt } from "@/lib/pending-prompt";
import type { PlanId } from "@/lib/types";

function TemplatesContent() {
  const router = useRouter();
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

      <TemplatesSection
        plan={plan}
        variant="full"
        onSelectPrompt={(prompt) => {
          // This page has no composer of its own — hand the prompt off to
          // the dashboard, the same way any other locked-navigation flow in
          // this app already does (see ModelSelector's onLockedNavigate),
          // rather than inventing a second mechanism.
          setPendingPrompt(prompt);
          router.push("/dashboard");
        }}
      />
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
