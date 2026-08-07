import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { PromptHero } from "@/components/prompt-hero";
import { BuilderMockup } from "@/components/builder-mockup";
import { FaqAccordion } from "@/components/faq-accordion";
import { PricingTable } from "@/components/pricing-table";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PLANS, PLAN_IDS } from "@/lib/types";
import { BLOG_POSTS } from "@/lib/blog";
import { formatDate } from "@/lib/utils";
import {
  ArrowRight,
  Wand2,
  Rocket,
  Monitor,
  ShieldCheck,
  Code2,
  Gauge,
  Github,
  Check,
} from "lucide-react";

const FEATURES = [
  {
    icon: Wand2,
    title: "Describe, don't code",
    body: "Write what you want in plain English. Breezify generates a complete, production-ready app: frontend, backend, and config.",
    span: "sm:col-span-2",
  },
  {
    icon: Rocket,
    title: "One-click deploy",
    body: "Ship straight to a live URL. No servers to configure, no domains required.",
  },
  {
    icon: Code2,
    title: "Full code, real ownership",
    body: "Inspect and edit every generated file in a built-in Monaco editor. Nothing is a black box.",
  },
  {
    icon: Github,
    title: "Push to GitHub",
    body: "Export any generated app straight to a repo and keep iterating in your own editor.",
  },
  {
    icon: Monitor,
    title: "Live preview, instantly",
    body: "See your app running in a sandboxed preview the moment it's generated, desktop or mobile, no build step required.",
  },
  {
    icon: Gauge,
    title: "Pick your model",
    body: "Choose Haiku, Sonnet, or Opus depending on how much reasoning power your app needs.",
    span: "sm:col-span-2",
  },
  {
    icon: ShieldCheck,
    title: "Serious infrastructure",
    body: "Firebase auth, Firestore, and Vercel deploys under the hood, the same tools production teams use.",
  },
];

const FAQS = [
  {
    q: "What is Breezify?",
    a: "Breezify is an AI app builder. Describe what you want in plain English and Breezify writes a complete, working codebase for it, then deploys it to a live URL.",
  },
  {
    q: "How is Breezify different from other app builders?",
    a: "Breezify gives you full, inspectable source code for everything it generates. It's not a black box. On the Plus plan and above, you can open any file in the built-in editor, understand exactly what was built, and export or push it to GitHub to keep iterating.",
  },
  {
    q: "What kind of apps can I build?",
    a: "Dashboards, internal tools, landing pages, trackers, small SaaS products, anything you can describe as a self-contained web app. More complex apps benefit from the Sonnet or Opus models.",
  },
  {
    q: "Do I need to know how to code?",
    a: "No. Just describe what you want. If you do know how to code, upgrading to Plus or above gives you full access to the generated source, so you can keep building on top of it.",
  },
  {
    q: "How does pricing work?",
    a: "Every new account gets $5.00 of free credit. Each generation costs credits depending on the model. Haiku 4.5 is cheapest, Opus 5 is most capable. Once you run out, top up or subscribe.",
  },
  {
    q: "Can I use my own domain?",
    a: "Every generated app deploys to a free *.vercel.app URL out of the box. Custom domains aren't managed from inside Breezify yet, but every deploy is a real Vercel project, so you can attach one directly from your Vercel dashboard.",
  },
];

export default function LandingPage() {
  return (
    <div>
      <SiteHeader />

      <section className="dot-grid spotlight relative overflow-hidden border-b border-border">
        <div className="container relative z-10 flex flex-col items-center gap-8 py-24 text-center md:py-32">
          <span className="animate-in inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
            </span>
            Now building with Claude, Gemini &amp; Llama
          </span>
          <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight md:text-6xl animate-in">
            Describe your app.
            <br />
            Breezify builds it.
          </h1>
          <p className="max-w-xl text-balance text-lg text-muted-foreground animate-in">
            Paste your idea below. Breezify writes the full codebase and deploys it
            to a live URL. No setup required.
          </p>
          <PromptHero />
          <p className="text-xs text-muted-foreground">
            $5.00 free credit on signup · No credit card required
          </p>
        </div>
        <div className="container relative z-10 pb-24">
          <BuilderMockup />
        </div>
      </section>

      <section id="features" className="border-b border-border py-24">
        <div className="container">
          <Reveal className="mb-14 max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Everything you need to ship, nothing you don&apos;t
            </h2>
            <p className="mt-3 text-muted-foreground">
              Breezify is built for people who want a finished product, not a demo.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 60} className={`card-hover relative bg-background p-7 ${f.span ?? ""}`}>
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-muted/40">
                  <f.icon className="h-5 w-5" strokeWidth={1.5} />
                </div>
                <h3 className="mb-2 font-medium">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-border py-24">
        <div className="container">
          <Reveal className="mb-14 max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-3 text-muted-foreground">
              Start free. Pay only for what you generate.
            </p>
          </Reveal>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLAN_IDS.map((id, i) => {
              const plan = PLANS[id];
              return (
              <Reveal key={plan.name} delay={i * 80}>
              <Card
                className={`card-hover h-full ${plan.highlighted ? "border-foreground" : ""}`}
              >
                <CardContent className="flex h-full flex-col p-7">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">{plan.name}</h3>
                    {plan.highlighted && (
                      <span className="rounded-full bg-foreground px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
                        Popular
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">/ {plan.period}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Link href="/signup" className="mt-7">
                    <Button
                      className="w-full"
                      variant={plan.highlighted ? "primary" : "secondary"}
                    >
                      {plan.id === "free" ? "Start free" : "Get started"}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
              </Reveal>
              );
            })}
          </div>

          <Reveal className="mt-14">
            <h3 className="mb-5 text-sm font-medium text-muted-foreground">
              Compare every plan
            </h3>
            <PricingTable />
          </Reveal>
        </div>
      </section>

      <section id="faq" className="border-b border-border py-24">
        <div className="container max-w-3xl">
          <Reveal className="mb-10">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Frequently asked questions
            </h2>
            <p className="mt-3 text-muted-foreground">Everything you need to know before building with Breezify.</p>
          </Reveal>
          <Reveal delay={100}>
            <FaqAccordion items={FAQS} />
          </Reveal>
        </div>
      </section>

      <section className="py-24">
        <Reveal className="container flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Your next app is one prompt away.
          </h2>
          <Link href="/signup">
            <Button size="lg">
              Start building free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </Reveal>
      </section>

      <section id="blog" className="border-b border-border py-24">
        <div className="container">
          <Reveal className="mb-14 max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">From the blog</h2>
            <p className="mt-3 text-muted-foreground">Notes on building and shipping apps with Breezify.</p>
          </Reveal>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {BLOG_POSTS.map((post, i) => (
              <Reveal key={post.slug} delay={i * 80}>
                <Link
                  href={`/blog/${post.slug}`}
                  className="card-hover block h-full rounded-lg border border-border bg-background p-7"
                >
                  <p className="text-xs text-muted-foreground">{formatDate(post.date)}</p>
                  <h3 className="mt-2 font-medium">{post.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{post.excerpt}</p>
                </Link>
              </Reveal>
            ))}
          </div>
          <Link
            href="/blog"
            className="mt-8 inline-flex items-center gap-1.5 text-sm font-medium transition-colors hover:text-muted-foreground"
          >
            View all posts
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <Reveal className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} Breezify. All rights reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-6">
            <Link href="/blog" className="hover:text-foreground transition-colors">
              Blog
            </Link>
            <Link href="/help" className="hover:text-foreground transition-colors">
              Help
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Sign up
            </Link>
          </div>
        </Reveal>
      </footer>
    </div>
  );
}
