"use client";

import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ProtectedRoute } from "@/components/protected-route";
import { Input } from "@/components/ui/input";
import { ChevronDown, Mail, Search } from "lucide-react";

const SUPPORT_EMAIL = "Feather.developer.123@gmail.com";

interface FaqEntry {
  question: string;
  answer: string;
}

interface FaqGroup {
  category: string;
  entries: FaqEntry[];
}

/** Kept in one place (not scattered as inline JSX) so it's easy to keep in sync with lib/types.ts as plans/limits change. */
const FAQ_GROUPS: FaqGroup[] = [
  {
    category: "Getting started",
    entries: [
      {
        question: "How do I build my first app?",
        answer:
          'From the dashboard, describe the app you want in plain English and hit generate — or start from a ready-made Template if you want something specific to duplicate and customize instead. Every plan gets a real number of free credits to try this with, no card required.',
      },
      {
        question: "What's the difference between a template and a generated app?",
        answer:
          "Templates are hand-built demo apps you can preview and duplicate instantly — no AI call, no credits spent. A generated app is built fresh from your own prompt by an AI model, which does use credits based on the model and length of the request.",
      },
      {
        question: "Can I edit an app after it's built?",
        answer:
          'Yes — keep describing changes in the same conversation ("refine" requests) and only the parts that need to change are updated. You can also use the Visual tab to click any element directly and either edit it inline or send it to the chat for a more involved change.',
      },
    ],
  },
  {
    category: "Billing & credits",
    entries: [
      {
        question: "What are credits and how do they get used?",
        answer:
          "Credits pay for AI generation calls — building a new app or refining an existing one. Free gives a one-time balance; Plus, Pro, and Max renew your balance every month. Viewing or duplicating a template never costs credits.",
      },
      {
        question: "What happens when I run out of credits?",
        answer:
          "You can still view, edit the code of, and manage your existing apps — you just can't generate or refine until your balance renews (paid plans) or you upgrade.",
      },
      {
        question: "How do I cancel or change my plan?",
        answer: "Go to Billing in the sidebar — you can upgrade, downgrade, or cancel from there, and changes take effect through Stripe's billing portal.",
      },
      {
        question: "Do unused credits roll over?",
        answer: "No — a paid plan's credit balance renews to its plan amount each billing period rather than stacking with what's left over.",
      },
    ],
  },
  {
    category: "Deploying & domains",
    entries: [
      {
        question: "How many apps can I have live at once?",
        answer:
          `Every plan has a real cap on simultaneously live apps (each one is a real, separate hosting project) — check the pricing page for your plan's exact number. You can always undeploy or delete an app to free a slot.`,
      },
      {
        question: "Why did my app stop working / redirect to a limit page?",
        answer:
          "Two independent limits can trigger this: a deployed app has a renewal window before it needs to be renewed (varies by plan, and never expires on the top plan), and every plan also has a monthly page-view ceiling per app. Renew or upgrade from the app's page to restore it.",
      },
      {
        question: "Can I use my own domain?",
        answer: "Yes, on Pro and above — connect a domain you already own, or purchase one directly, from an app's settings.",
      },
    ],
  },
  {
    category: "Templates",
    entries: [
      {
        question: "Do I need credits to use a template?",
        answer: "No — every template can be previewed for free. Duplicating one into your own editable app requires the Pro plan or higher, but costs no credits either way.",
      },
      {
        question: "Can I customize a template after duplicating it?",
        answer: "Yes — once duplicated it's a normal app in your dashboard: edit it with prompts, use the Visual tab, or open the code directly.",
      },
    ],
  },
  {
    category: "Troubleshooting",
    entries: [
      {
        question: "My build failed to deploy — what do I do?",
        answer:
          "Check the error message on the build page first — it usually names the specific file or dependency that broke. If a fix in the chat doesn't resolve it, contact support below with your app's name and the error shown.",
      },
      {
        question: "A generated app's live preview looks broken but the code looks fine",
        answer:
          "The live preview runs in a sandboxed browser environment that's slightly different from a real deployment — try Deploy to see the real, built version, which is the one your users would actually see.",
      },
      {
        question: "I found a bug or something looks wrong",
        answer: "Please email support with as much detail as you can — what you were doing, what you expected, and a screenshot if you have one. That's the fastest way for it to get fixed.",
      },
    ],
  },
];

function FaqItem({ entry }: { entry: FaqEntry }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/40"
      >
        <span>{entry.question}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{entry.answer}</div>
      )}
    </div>
  );
}

function HelpContent() {
  const [query, setQuery] = useState("");

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_GROUPS;
    return FAQ_GROUPS.map((group) => ({
      ...group,
      entries: group.entries.filter(
        (e) => e.question.toLowerCase().includes(q) || e.answer.toLowerCase().includes(q)
      ),
    })).filter((group) => group.entries.length > 0);
  }, [query]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="py-10 text-center md:py-14">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Help</h1>
        <p className="mt-2.5 text-sm text-muted-foreground">
          Answers to common questions, and how to reach support.
        </p>
      </div>

      <div className="relative mb-8">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help articles..."
          className="pl-9"
        />
      </div>

      {grouped.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No help articles match "{query}".</p>
      ) : (
        <div className="space-y-8">
          {grouped.map((group) => (
            <div key={group.category}>
              <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.category}
              </h2>
              <div className="space-y-2">
                {group.entries.map((entry) => (
                  <FaqItem key={entry.question} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-12 rounded-xl border border-border bg-muted/30 p-6 text-center">
        <Mail className="mx-auto mb-3 h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Still need help?</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Email us and we'll get back to you as soon as we can.
        </p>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-90"
        >
          <Mail className="h-4 w-4" />
          {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}

export default function HelpPage() {
  return (
    <ProtectedRoute>
      <AppShell>
        <HelpContent />
      </AppShell>
    </ProtectedRoute>
  );
}
