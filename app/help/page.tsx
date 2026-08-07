import type { Metadata } from "next";
import { MessageCircleQuestion, Wrench, CreditCard as CreditCardIcon } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { FaqAccordion } from "@/components/faq-accordion";
import { HelpContact } from "@/components/help-contact";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Help: Breezify",
  description: "Answers to common questions about building, deploying, and billing on Breezify.",
};

const GENERAL_FAQS = [
  {
    q: "How do I build my first app?",
    a: "From the dashboard, click \"New app\" and describe what you want in plain English, or start from one of the templates. Breezify writes a complete codebase and shows a live preview once it's done.",
  },
  {
    q: "My generation failed or looks broken. What do I do?",
    a: "Open the app and use the chat to describe what's wrong — refining an existing app edits it in place rather than starting over. If a generation was interrupted (closed tab, lost connection), you can safely retry; you're only charged for generations that actually complete or error out.",
  },
  {
    q: "Can I edit the generated code myself?",
    a: "Yes, on the Plus plan and above. Open any app and use the built-in editor to view and change files directly, or export/push it to GitHub to keep iterating outside Breezify.",
  },
  {
    q: "How do I deploy an app?",
    a: "Open the app and click Deploy. Each deploy is a real Vercel project on a free *.vercel.app URL. Custom domains aren't managed from inside Breezify yet — attach one directly from your Vercel dashboard once it's deployed.",
  },
];

const BILLING_FAQS = [
  {
    q: "How do credits work?",
    a: "Every new account starts with $5.00 of free credit. Each generation or refine costs credits based on the model you pick — Haiku 4.5 is cheapest, Opus 5 is the most capable and costs the most. Your remaining balance is always visible in the sidebar and on the Billing page.",
  },
  {
    q: "What happens when I run out of credits?",
    a: "Generation and deploy stop working until you top up or subscribe to a plan. Nothing you've already built is affected — you can still view, export, and redeploy existing apps.",
  },
  {
    q: "Was I charged for a generation that failed?",
    a: "You're only charged once a generation actually completes or a request is fully sent to the model. If something looks off, check the Billing page for a breakdown, then reach out below with the app name and roughly when it happened.",
  },
  {
    q: "How do I cancel or change my plan?",
    a: "Go to Billing and manage your subscription from there. Downgrading or canceling takes effect at the end of the current billing period; your credit balance carries over.",
  },
];

const ACCOUNT_FAQS = [
  {
    q: "I didn't get my verification or password reset email.",
    a: "Check spam/promotions first. If it still hasn't arrived after a few minutes, go back to the sign-in screen and request a fresh one — links expire after a while, so an old email may simply be stale.",
  },
  {
    q: "How do I delete my account?",
    a: "Go to Settings and use \"Delete account\" at the bottom. This permanently removes every app you own, your billing history, and your credit balance, and cannot be undone.",
  },
];

function FaqSection({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof MessageCircleQuestion;
  title: string;
  items: { q: string; a: string }[];
}) {
  return (
    <section className="mb-12">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-muted/40">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      <FaqAccordion items={items} />
    </section>
  );
}

export default function HelpPage() {
  return (
    <div>
      <SiteHeader />
      <div className="container max-w-3xl py-16">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Help</h1>
        <p className="mt-3 text-muted-foreground">
          Answers to the most common questions. Can&apos;t find what you need? Contact us below.
        </p>

        <div className="mt-12">
          <FaqSection icon={MessageCircleQuestion} title="Building apps" items={GENERAL_FAQS} />
          <FaqSection icon={CreditCardIcon} title="Billing & credits" items={BILLING_FAQS} />
          <FaqSection icon={Wrench} title="Account" items={ACCOUNT_FAQS} />
        </div>

        <HelpContact />

        <p className="mt-12 text-sm text-muted-foreground">
          See also:{" "}
          <Link href="/terms" className="text-foreground hover:underline">
            Terms
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="text-foreground hover:underline">
            Privacy
          </Link>
        </p>
      </div>
    </div>
  );
}
