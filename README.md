# Feather 123

Feather 123 turns a plain-English prompt into a complete, production-ready app. This repo contains **Phase 1**: authentication, the landing page, the dashboard, and the AI generation flow with a live code preview.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Firebase Auth (email/password, Google, GitHub, Apple) + Firestore
- Anthropic Claude API (Haiku 4.5 / Sonnet 4.5 / Opus 5) for generation
- Monaco Editor for code preview

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create a Firebase project** at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable **Authentication** → Sign-in methods: Email/Password, Google, Apple, GitHub
   - Enable **Firestore Database** (start in production mode)
   - Deploy the included security rules: `firebase deploy --only firestore:rules,firestore:indexes` (requires the [Firebase CLI](https://firebase.google.com/docs/cli))
   - Copy your web app config into `.env.local` (`NEXT_PUBLIC_FIREBASE_*` keys)
   - Generate a service account (Project settings → Service accounts → Generate new private key) and copy `project_id`, `client_email`, and `private_key` into the `FIREBASE_ADMIN_*` variables. This powers server-side credit deduction and generation.

3. **Get an Anthropic API key** at [console.anthropic.com](https://console.anthropic.com) and set `ANTHROPIC_API_KEY`.

4. Copy `.env.example` to `.env.local` and fill in the values above.

   ```bash
   cp .env.example .env.local
   ```

5. **Run the dev server**

   ```bash
   npm run dev
   ```

## What's implemented (Phase 1)

- Landing page, pricing, feature grid
- Full auth: signup/login (email + Google + GitHub + Apple), forgot password, email verification, account settings (change password, connected providers, delete account)
- Firestore data model for `users`, `apps`, `transactions`
- $5.00 free credit on signup, credit costs per model (Haiku 0.50 / Sonnet 1.00 / Opus 2.00 credits), enforced server-side in `app/api/generate/route.ts`
- Dashboard ("My Apps") with status badges, empty state, delete
- Build flow: prompt + model selector → Claude generates a full app as structured files → live Monaco preview
- Firestore security rules. Credits, plan, and generated code are only ever written by the trusted server (Admin SDK), never directly by the client.

## Not yet built (Phases 2 and 3)

- Vercel deployment pipeline (`deployedUrl`, live status polling)
- Per-app analytics (visits, errors, load time, traffic graph)
- Stripe billing (credit top-ups, subscriptions)
- Admin margin-tracking dashboard
- "Made with Feather 123" watermark injection

These are scoped in `lib/types.ts` (`AppStatus`, `FeatherTransaction`) and the Firestore rules already anticipate them, but the UI intentionally doesn't link to them yet so there are no dead pages.
