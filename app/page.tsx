import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FeatherMark } from "@/components/logo";
import {
  ArrowRight,
  Wand2,
  Rocket,
  BarChart3,
  ShieldCheck,
  Code2,
  Gauge,
} from "lucide-react";

const FEATURES = [
  {
    icon: Wand2,
    title: "Describe, don't code",
    body: "Write what you want in plain English. Feather generates a complete, production-ready app — frontend, backend, and config.",
  },
  {
    icon: Rocket,
    title: "One-click deploy",
    body: "Ship straight to a live URL. No servers to configure, no domains required — just a working app in seconds.",
  },
  {
    icon: Code2,
    title: "Full code, real ownership",
    body: "Inspect and edit every generated file in a built-in editor. Nothing is a black box.",
  },
  {
    icon: BarChart3,
    title: "Built-in analytics",
    body: "Track visits, errors, and load time for every app you ship, right from your dashboard.",
  },
  {
    icon: Gauge,
    title: "Pick your model",
    body: "Choose Haiku, Sonnet, or Opus depending on how much reasoning power your app needs.",
  },
  {
    icon: ShieldCheck,
    title: "Serious infrastructure",
    body: "Firebase auth, Firestore, and Vercel deploys under the hood — the same tools production teams use.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "one-time",
    description: "$5.00 in free credit to try Feather out.",
    features: ["5.00 credits included", "All three models", "Public app deploys", "Community support"],
    cta: "Start free",
    href: "/signup",
  },
  {
    name: "Pay as you go",
    price: "$10+",
    period: "per top-up",
    description: "Buy credit packs whenever you need them.",
    features: ["$10 / $25 / $50 packs", "Credits never expire", "All three models", "Email support"],
    cta: "Get started",
    href: "/signup",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$29",
    period: "per month",
    description: "For teams shipping apps regularly.",
    features: ["Monthly credits included", "Priority generation", "Advanced analytics", "Priority support"],
    cta: "Start free",
    href: "/signup",
  },
];

export default function LandingPage() {
  return (
    <div>
      <SiteHeader />

      <section className="dot-grid border-b border-border">
        <div className="container flex flex-col items-center gap-8 py-28 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground animate-in">
            <FeatherMark className="h-3.5 w-3.5" />
            Now generating with Claude Haiku 4.5, Sonnet 4.5 &amp; Opus 5
          </div>
          <h1 className="max-w-3xl text-balance text-5xl font-semibold tracking-tight md:text-7xl animate-in">
            Build real apps. <br /> Just describe them.
          </h1>
          <p className="max-w-xl text-balance text-lg text-muted-foreground animate-in">
            Feather turns a plain-English prompt into a complete, production-ready
            application — and deploys it to a live URL in seconds.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 animate-in">
            <Link href="/signup">
              <Button size="lg">
                Start building free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="secondary">
                Log in
              </Button>
            </Link>
          </div>
          <p className="text-xs text-muted-foreground">No credit card required · $5.00 free credit on signup</p>
        </div>
      </section>

      <section id="features" className="border-b border-border py-24">
        <div className="container">
          <div className="mb-14 max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Everything you need to ship, nothing you don't
            </h2>
            <p className="mt-3 text-muted-foreground">
              Feather is built for people who want a finished product, not a demo.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-background p-7">
                <f.icon className="mb-4 h-5 w-5" strokeWidth={1.5} />
                <h3 className="mb-2 font-medium">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-b border-border py-24">
        <div className="container">
          <div className="mb-14 max-w-xl">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Simple, transparent pricing
            </h2>
            <p className="mt-3 text-muted-foreground">
              Start free. Pay only for what you generate.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={plan.highlighted ? "border-foreground" : ""}
              >
                <CardContent className="flex h-full flex-col p-7">
                  <h3 className="font-medium">{plan.name}</h3>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">/ {plan.period}</span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-foreground" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                  <Link href={plan.href} className="mt-7">
                    <Button
                      className="w-full"
                      variant={plan.highlighted ? "primary" : "secondary"}
                    >
                      {plan.cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24">
        <div className="container flex flex-col items-center gap-6 text-center">
          <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Your next app is one prompt away.
          </h2>
          <Link href="/signup">
            <Button size="lg">
              Start building free
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-sm text-muted-foreground md:flex-row">
          <span>© {new Date().getFullYear()} Feather. All rights reserved.</span>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
