# Feather 123

Feather 123 turns a plain-English prompt into a complete, production-ready app. This repo contains **Phase 1**: authentication, the landing page, the dashboard, and the AI generation flow with a live code preview.

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
- Prompt-first dashboard with a sidebar, ⌘K command palette, file attachments, and optional voice dictation (the microphone is only requested when you click it, never on page load)
- Build flow: prompt + model selector → the model generates a full app as structured files → live Monaco preview
- Refine an existing app with a follow-up instruction; the model gets the current files and returns the updated set
- Push any generated app to a new GitHub repository. The token is used for that one request and never stored; only the resulting repo URL is saved.
- Rename apps, download the whole app as a ZIP, copy individual files
- Split workspace per app: change history on the left with per-turn Details/Files tabs and model-suggested follow-ups, live preview or code on the right
- Live in-browser preview. Generated sources are transpiled with Babel standalone in a sandboxed iframe, so React apps run without a build step; apps needing a server show a clear fallback instead.
- "Built with Feather 123" badge injected into previews and exports (ZIP, GitHub) rather than stored in the source, so the code you see stays clean
- Bring your own API key: paste an Anthropic or Gemini key in Settings and generations cost 0 credits and unlock every model. Keys live in your browser's localStorage and ride along with the single request that uses them; they are never written to Firestore.
- No Firebase admin credentials anywhere: `/api/generate` and `/api/delete-account` verify the caller's Firebase ID token against Google's public keys and write to Firestore over REST using that same token, so Firestore's own security rules are the enforcement, not a trusted server key

## Not yet built (Phases 2 and 3)

- Vercel deployment pipeline (`deployedUrl`, live status polling)
- Per-app analytics (visits, errors, load time, traffic graph)
- Stripe billing (credit top-ups, subscriptions)
- Admin margin-tracking dashboard
- "Made with Feather 123" watermark injection

These are scoped in `lib/types.ts` (`AppStatus`, `FeatherTransaction`) and the Firestore rules already anticipate them, but the UI intentionally doesn't link to them yet so there are no dead pages.
