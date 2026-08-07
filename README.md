# Breezify

Breezify turns a plain-English prompt into a complete, production-ready app. This repo contains **Phase 1**: authentication, the landing page, the dashboard, and the AI generation flow with a live code preview.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Firebase Auth (email/password, Google, GitHub, Apple) + Firestore
- Anthropic Claude (Haiku 4.5 / Sonnet 4.5 / Opus 5) and Google Gemini
  (3.6 Flash / 3.1 Pro) for generation
- Monaco Editor for code preview

## Models and plans

Models are plan-gated. Free accounts get Haiku 4.5 only; Plus adds Sonnet 4.5
and Gemini 3.6 Flash; Pro adds Opus 5 and Gemini 3.1 Pro. The registry lives in
`lib/types.ts` (`MODEL_INFO` and `PLANS`) and is the single source of truth for
the landing page, the billing page, and the server-side gate in
`app/api/generate/route.ts`.

Providers are independent: with only `ANTHROPIC_API_KEY` set, the Gemini models
render as unavailable and everything else keeps working, and vice versa.
`GET /api/models` reports which providers are configured.

## Multi-tenant deployment and free-tier limits

Breezify hosts deployed apps two different ways depending on plan, because
Vercel Hobby caps an account at **200 projects total, shared across every
user's every app** — and every generated app deploying as its own real
Vercel project (the simplest approach) means that number, not anything in
Breezify's own code, is what actually limits how many total users a Hobby
account can support.

- **Free plan: zero Vercel projects per app.** `app/api/deploy` routes free
  deploys through `deployFreeTierApp()` in `lib/deploy-actions.ts`, which
  just writes a `subdomain` slug to the app doc — no Vercel API call at
  all. `middleware.ts` rewrites `{slug}.DEPLOY_DOMAIN` requests to
  `app/apps/[subdomain]/route.ts`, which looks the app up (`lib/tenant-app.ts`,
  cached) and renders its files with the exact same `buildPreview()`
  (`lib/preview.ts`) the dashboard's own live preview already uses — Babel
  standalone transpiling in the visitor's browser, no server build step.
  An unbounded number of free-tier apps this way costs a constant *one*
  Vercel project (this app itself), not one each. The tradeoff: no real
  backend (an `api/` folder still renders with a banner, same as the
  dashboard preview, but nothing answers its requests) and no per-app custom
  domain — that's what upgrading actually buys.
- **Plus/Pro/Max: a real Vercel project per app**, exactly as before —
  `lib/vercel-deploy.ts`, aliased to `{slug}.breezify.app` once `DEPLOY_DOMAIN`
  is set, with a real SSL cert, real serverless backend functions (a simple
  Express backend gets auto-wrapped — see `lib/express-adapter.ts`), and
  real per-app custom domains (`app/api/domains`).

Both paths compute the same slug (`subdomainSlug()` in `lib/deploy-actions.ts`,
shared by both), which always embeds a slice of the app's own id — so no two
apps can ever collide on a subdomain, on either path, by construction, and an
app's URL stays the same across an upgrade from one hosting path to the
other.

**Vercel setup this needs, beyond the apex domain:** once `breezify.app` is
bought, add both `breezify.app` **and the wildcard `*.breezify.app`** as
domains on the main Breezify Vercel project (not just the apex) — the
wildcard is what makes every free-tier subdomain resolve to this project by
default. A paid app's own real per-project alias still takes priority for
its own specific subdomain once deployed (Vercel resolves the more specific
alias first), so this doesn't conflict with paid hosting.

Free-plan business rules, all in `lib/types.ts` and enforced server-side (not
just hidden in the UI):

- **`MAX_ACTIVE_DEPLOYED_APPS`** — at most 3 live apps at once on Free (7
  Plus, 15 Pro, 35 Max — capped on every plan, since a paid app still spends
  a real Vercel project). Enforced in `lib/deploy-actions.ts`
  (`deployNewApp`) before a deploy is allowed to claim a new slot; a redeploy
  of an already-live app never counts against the cap. Delete an app or
  undeploy it (dashboard app card, or `app/api/apps/[appId]/undeploy`) to
  free a slot immediately without losing its code — the app stays intact and
  can be redeployed any time.
- **`MONTHLY_PAGE_VIEW_LIMIT`** — 5,000 views/month on Free (100,000 Plus,
  unlimited Pro/Max), enforced by `lib/traffic-guard.ts`. On the free-tier
  hosting path this is checked directly, server-side, on every request in
  `app/apps/[subdomain]/route.ts` (no client round-trip at all). Paid-plan
  apps live on a different origin (their own Vercel project), so they carry
  a tiny beacon instead (`lib/analytics-snippet.ts`) that pings `/api/track`
  once per page load. Either way, once an app is over its cap, visitors are
  redirected to `/limit-reached`, and the "is this app blocked" check is
  wrapped in `unstable_cache` with a 60s revalidate window so a busy app
  doesn't mean a database read on every single page load.
- **`DEPLOY_EXPIRY_DAYS`** — Free-plan deploys auto-expire 30 days after
  going live (Plus/Pro/Max never expire) and redirect visitors to
  `/limit-reached` until renewed. Renewal (`app/api/apps/[appId]/renew`,
  surfaced as a "Renew" button on the app's build page) is only accepted
  within `RENEWAL_WINDOW_DAYS` (2 days) of expiry, or any time after it's
  already expired — not any earlier, so it's a genuine "about to lapse"
  renewal rather than a way to keep pushing the clock out indefinitely.

**Needs `FIREBASE_SERVICE_ACCOUNT` in production — required, not optional,
for free-tier hosting specifically.** `app/apps/[subdomain]/route.ts` looks
an app up by its `subdomain` field from an anonymous visitor's request,
which carries no Firebase ID token at all; Firestore rules can't expose that
lookup (or the traffic-cap/expiry check that comes with it) to an
unauthenticated reader, so both go through the Admin SDK
(`lib/tenant-app.ts`, `lib/traffic-guard.ts`). Without it configured, every
free-tier subdomain serves a 503 instead of the app. Paid-plan deploys
(real Vercel projects) and the 3-app cap don't need it — those run under the
calling user's own ID token like everything else in this app.

**This is still commercial use of Vercel Hobby, which its terms of service
don't cover** — see the free/Hobby-tier limits discussion this section is
built around. Fine for early testing with a handful of users; move to Vercel
Pro before any real public launch.

## Setup

Breezify needs exactly one real secret: `ANTHROPIC_API_KEY`. Firebase requires no admin credentials or service account at all, every server-side write is authenticated with the calling user's own Firebase ID token and enforced by `firestore.rules`, the same way a client write would be. The Firebase web config in `lib/firebase-public-config.ts` is not a secret (Firebase config is meant to ship in the browser bundle) and already points at this project's own Firebase project, so the app runs with zero configuration out of the box. Set `NEXT_PUBLIC_FIREBASE_*` env vars only if you want to point it at a different Firebase project.

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Get an Anthropic API key** at [console.anthropic.com](https://console.anthropic.com) and set `ANTHROPIC_API_KEY`.

3. Copy `.env.example` to `.env.local` and fill in the key above.

   ```bash
   cp .env.example .env.local
   ```

4. (Optional, only if using your own Firebase project) In the Firebase console: enable **Authentication** sign-in methods for Email/Password, Google, Apple, and GitHub; enable **Firestore Database**; and deploy the included rules with `firebase deploy --only firestore:rules,firestore:indexes` (requires the [Firebase CLI](https://firebase.google.com/docs/cli)).

5. **Run the dev server**

   ```bash
   npm run dev
   ```

## What's implemented (Phase 1)

- Landing page, pricing, feature grid
- Full auth: signup/login (email + Google + GitHub + Apple), forgot password, email verification, account settings (change password, connected providers, delete account)
- Firestore data model for `users`, `apps`, `transactions`
- $5.00 free credit on signup, credit costs per model (Haiku 0.50 / Sonnet 1.00 / Opus 2.00 credits), enforced by `firestore.rules` on every write, including the ones from `app/api/generate/route.ts`
- Dashboard ("My Apps") with status badges, empty state, delete
- Prompt-first dashboard with a sidebar, ⌘K command palette, file attachments, and optional voice dictation (the microphone is only requested when you click it, never on page load)
- Build flow: prompt + model selector → the model generates a full app as structured files → live Monaco preview
- Refine an existing app with a follow-up instruction; the model gets the current files and returns the updated set
- Push any generated app to a new GitHub repository, and pull the latest commit back in later ("Sync"). The token is used for that one request and never stored; only the resulting repo URL is saved. Both are Plus-and-up, enforced server-side.
- Per-app secrets: a key/value store (`apps/{id}/secrets`) for anything the generated app calls out with, visible only to the app's owner.
- Real persistence for generated apps via `/api/app-data`: a generic per-app data API backed by Firestore (`app_data/{appId}/{collection}`), scoped by ownership through `firestore.rules` rather than admin credentials. The generation prompt teaches the model this contract so it can opt in when an app needs to persist or share data across visitors, instead of being limited to localStorage.
- Deployed-app visit analytics, visible on every plan.
- Free-tier apps host on a zero-Vercel-project shared subdomain path
  (`middleware.ts`, `app/apps/[subdomain]`) instead of their own Vercel
  project, plus the free-tier limits themselves: max 3 live apps at once, a
  5,000 view/month traffic cap with a redirect once exceeded, and a 30-day
  auto-expiry with a renewal window — see "Multi-tenant deployment and
  free-tier limits" above.
- Rename apps, download the whole app as a ZIP, copy individual files
- Split workspace per app: change history on the left with per-turn Details/Files tabs and model-suggested follow-ups, live preview or code on the right
- Live in-browser preview. Generated sources are transpiled with Babel standalone in a sandboxed iframe, so React apps run without a build step; apps needing a server show a clear fallback instead.
- "Built with Breezify" badge injected into previews and exports (ZIP, GitHub) rather than stored in the source, so the code you see stays clean
- Bring your own API key: paste an Anthropic or Gemini key in Settings and generations cost 0 credits and unlock every model. Keys live in your browser's localStorage and ride along with the single request that uses them; they are never written to Firestore.
- No Firebase admin credentials anywhere: `/api/generate` and `/api/delete-account` verify the caller's Firebase ID token against Google's public keys and write to Firestore over REST using that same token, so Firestore's own security rules are the enforcement, not a trusted server key

## Not yet built (Phases 2 and 3)

- Deeper per-app analytics (errors, load time, traffic graph beyond the visit count already tracked)
- Stripe credit top-ups (subscriptions are live, see `app/api/stripe`)
- Admin margin-tracking dashboard
- "Made with Breezify" watermark injection

These are scoped in `lib/types.ts` (`AppStatus`, `FeatherTransaction`) and the Firestore rules already anticipate them, but the UI intentionally doesn't link to them yet so there are no dead pages.
