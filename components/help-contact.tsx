"use client";

import { useState } from "react";
import { Mail, MessageSquare } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { SupportDialog } from "@/components/support-dialog";

const SUPPORT_EMAIL = "Feather.developer.123@gmail.com";

export function HelpContact() {
  const { user } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-muted/20 p-6">
      <div className="mb-2 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background">
          <Mail className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">Still need help?</h2>
      </div>
      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
        {user
          ? "Send us a message from your account, or email us directly — include the app name if relevant and what you were trying to do."
          : "Email us and include your account email, the app name if relevant, and what you were trying to do. We read every message."}
      </p>
      <div className="flex flex-wrap gap-3">
        {user && (
          <button
            onClick={() => setSupportOpen(true)}
            className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:opacity-90"
          >
            <MessageSquare className="h-4 w-4" />
            Message support
          </button>
        )}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Mail className="h-4 w-4" />
          {SUPPORT_EMAIL}
        </a>
      </div>
      {supportOpen && <SupportDialog onClose={() => setSupportOpen(false)} />}
    </section>
  );
}
