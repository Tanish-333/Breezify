# Feather 123

Feather 123 turns a plain-English prompt into a complete, production-ready app. This repo contains **Phase 1**: authentication, the landing page, the dashboard, and the AI generation flow with a live code preview.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Firebase Auth (email/password, Google, GitHub, Apple) + Firestore
- Anthropic Claude API (Haiku 4.5 / Sonnet 4.5 / Opus 5) for generation
- Monaco Editor for code preview

## Setup

Feather 123 needs exactly one real secret: `ANTHROPIC_API_KEY`. Firebase requires no admin credentials or service account at all, every server-side write is authenticated with the calling user's own Firebase ID token and enforced by `firestore.rules`, the same way a client write would be. The Firebase web config in `lib/firebase-public-config.ts` is not a secret (Firebase config is meant to ship in the browser bundle) and already points at this project's own Firebase project, so the app runs with zero configuration out of the box. Set `NEXT_PUBLIC_FIREBASE_*` env vars only if you want to point it at a different Firebase project.

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
- Build flow: prompt + model selector → Claude generates a full app as structured files → live Monaco preview
- No Firebase admin credentials anywhere: `/api/generate` and `/api/delete-account` verify the caller's Firebase ID token against Google's public keys and write to Firestore over REST using that same token, so Firestore's own security rules are the enforcement, not a trusted server key

## Not yet built (Phases 2 and 3)

- Vercel deployment pipeline (`deployedUrl`, live status polling)
- Per-app analytics (visits, errors, load time, traffic graph)
- Stripe billing (credit top-ups, subscriptions)
- Admin margin-tracking dashboard
- "Made with Feather 123" watermark injection

These are scoped in `lib/types.ts` (`AppStatus`, `FeatherTransaction`) and the Firestore rules already anticipate them, but the UI intentionally doesn't link to them yet so there are no dead pages.
