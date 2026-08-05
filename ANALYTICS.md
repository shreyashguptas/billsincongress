# Analytics tracking plan (PostHog)

This file is the **single source of truth** for product analytics on Bills in Congress.
Every event we send to PostHog is registered here. If an event is not in this file, it
should not exist in the code — and if it's in this file, it must exist in the code.

- PostHog project: **BillsInCongress** (project id `451900`, US Cloud, `https://us.posthog.com`)
- Client SDK: `posthog-js`, initialized in `instrumentation-client.ts`
- Server SDK: `posthog-node`, wrapped in `lib/posthog-server.ts`
- Typed event helpers (use these, never call `posthog.capture` with a raw string): `lib/analytics.ts`

---

## ⚠️ The contract — read this before changing any feature

**These rules are mandatory for every code change (human or AI):**

1. **New feature → new events.** Any new user-facing feature MUST ship with analytics:
   - Add the event(s) to the registry table in this file.
   - Add a typed helper to `lib/analytics.ts`.
   - Call the helper from the feature code.
   - All three in the same commit as the feature.

2. **Removed feature → removed events.** When a feature is removed:
   - Delete its `lib/analytics.ts` helpers and all call sites.
   - Move its rows from the registry table to the "Retired events" section at the bottom
     of this file (with the date) — never silently delete history, since old data still
     exists in PostHog.

3. **Changed feature → reviewed events.** If a feature's UX changes (new steps, renamed
   buttons, different flow), check whether its events and properties still describe
   reality. Update names/properties if not, and note the change in "Retired events".

4. **Never rename an event casually.** Renaming breaks every insight, funnel, and
   dashboard built on it. If a rename is truly needed, treat it as remove + add and
   note it in "Retired events".

5. **Event names** are `snake_case`, lowercase, in `object_action` (past tense) form:
   `bill_viewed`, `signup_completed`, `bills_filters_applied`. Properties are
   `snake_case` too. Don't invent new naming styles.

6. **No personal data in event properties.** Email/name only go on the **person profile**
   via `identify()`, never on individual events.

---

## What PostHog captures automatically (no code needed)

These are enabled by `posthog.init` config in `instrumentation-client.ts`:

| Capture | What it gives us |
|---|---|
| `$pageview` / `$pageleave` | Every page visited, time on page, exit pages, full URL, referrer |
| `$autocapture` | Every click on links/buttons/inputs across the whole site (incl. nav, footer, Learn/About CTAs) |
| Session replay | Video-style recordings of real sessions, console logs, network perf |
| Web vitals | LCP, CLS, FCP, INP per page |
| `$exception` | Uncaught JS errors and unhandled promise rejections (Error Tracking) |
| Heatmaps | Click/move/scroll-depth maps per page (rendered from autocapture data) |

Server-rendered pages with no interactivity (the About page and the legal pages — `/terms`,
`/privacy`) intentionally have **no custom
code** — their CTA clicks are captured by autocapture and tagged with
`data-ph-capture-attribute-*` HTML attributes so they can be filtered in PostHog. The Learn
page is interactive (civics guide) and fires its own custom events — see "Learn page" below.

---

## Custom event registry

### Identity & auth

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `signup_form_submitted` | User submits the email+password sign-up form | `method: "password"` | `components/auth/sign-up-form.tsx` |
| `signup_verification_submitted` | User submits the 6-digit email verification code | — | `components/auth/sign-up-form.tsx` |
| `signup_verification_code_resent` | User clicks "Resend code" | — | `components/auth/sign-up-form.tsx` |
| `signup_completed` | Account creation fully done (email verified, or Google OAuth return for a fresh account) | `method: "password" \| "google"` | `components/auth/sign-up-form.tsx`, `components/analytics/posthog-auth-sync.tsx` |
| `signup_failed` | Sign-up step errored | `step: "credentials" \| "verification"`, `reason` | `components/auth/sign-up-form.tsx` |
| `signin_submitted` | User submits the sign-in form | `method: "password"` | `components/auth/sign-in-form.tsx` |
| `signin_completed` | Sign-in succeeded (password, or Google OAuth return for an existing account) | `method: "password" \| "google"` | `components/auth/sign-in-form.tsx`, `components/analytics/posthog-auth-sync.tsx` |
| `signin_failed` | Sign-in failed | `reason: "invalid_credentials" \| "other"` | `components/auth/sign-in-form.tsx` |
| `auth_google_clicked` | User clicks a "Continue with Google" button (before OAuth redirect) | `intent: "sign_in" \| "sign_up"` | `components/auth/google-button.tsx` |
| `signed_out` | User signs out | — | `components/auth/user-menu.tsx`, `app/account/page.tsx` |
| `welcome_modal_shown` | New-user welcome/celebration modal appeared | — | `components/auth/welcome-new-user.tsx` |

### Bill discovery (dashboard + browse)

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `dashboard_congress_selected` | User switches Congress on the home dashboard | `congress` | `app/components/dashboard/DashboardClient.tsx` |
| `dashboard_drilldown_clicked` | User clicks any dashboard stat/chart that drills into /bills (status bar, policy area, sponsor, state, metric) | `filter_type`, `filter_value`, `congress` | `app/components/dashboard/DashboardClient.tsx` |
| `bills_filters_applied` | User clicks "Apply filters" on the bills page | `status`, `bill_type`, `congress`, `state`, `policy_area`, `introduced_date`, `last_action_date`, `title_query`, `bill_number`, `sponsor_count`, `active_filter_count` | `app/bills/page.tsx` |
| `bills_filters_cleared` | User clicks "Clear all" filters | — | `app/bills/page.tsx` |
| `bills_load_more_clicked` | User clicks "Load more bills" | `next_page`, `loaded_count` | `app/bills/page.tsx` |
| `bills_no_results` | A filtered search returned zero bills (UX friction signal) | `active_filter_count`, `title_query` | `app/bills/page.tsx` |
| `bill_card_clicked` | User clicks a bill card in the results grid | `bill_id`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage` | `components/bills/bill-card.tsx` |

### Bill detail & AI chat

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `bill_viewed` | Bill detail page rendered (top of the chat funnel) | `bill_id`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage`, `has_summary`, `has_pdf` | `components/bills/bill-details.tsx` |
| `bill_base_rate_viewed` | Committee base-rate context line shown on a bill detail page (passive, once per bill view) | `bill_id`, `chamber`, `days_in_committee`, `base_rate_percent`, `base_rate_sample` | `components/bills/bill-details.tsx` |
| `bill_pdf_opened` | User clicks "Read full text (PDF)" | `bill_id` | `components/bills/bill-details.tsx` |
| `bill_save_toggled` | Signed-in user saves or unsaves a bill on the detail page | `bill_id`, `action: "saved" \| "unsaved"`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage` | `components/bills/save-bill-button.tsx` |
| `bill_save_signin_redirected` | Signed-out user clicked Save and was sent to sign-in (conversion moment) | `bill_id` | `components/bills/save-bill-button.tsx` |
| `bill_chat_question_submitted` | User submits a question to bill chat | `bill_id`, `question`, `question_length`, `source: "typed" \| "example"`, `question_number`, `user_type: "anonymous" \| "authed"` | `components/bills/bill-qa.tsx` |
| `bill_chat_answer_received` | AI answer came back successfully | `bill_id`, `response_ms`, `answer_length` | `components/bills/bill-qa.tsx` |
| `bill_chat_failed` | Chat request errored (not rate limit) | `bill_id`, `error` | `components/bills/bill-qa.tsx` |
| `bill_chat_rate_limited` | User hit the daily question limit | `bill_id`, `limit_kind: "anonymous" \| "authed"`, `max` | `components/bills/bill-qa.tsx` |
| `rate_limit_signup_clicked` | User clicks "Sign up free" in the rate-limit dialog (key conversion moment) | `limit_kind` | `components/bills/rate-limit-dialog.tsx` |
| `rate_limit_signin_clicked` | User clicks "I have an account" in the rate-limit dialog | `limit_kind` | `components/bills/rate-limit-dialog.tsx` |

### Learn page (interactive civics guide)

The Learn page is an illustrated, interactive explainer of how Congress works. Each
interactive element fires events so we can see which parts people actually engage with
(and where they drop off). Static CTA clicks are still covered by autocapture.

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `learn_state_selected` | User picks their state in the "two rooms" seat-chart explorer | `state`, `representatives` | `app/learn/components/chamber-seats.tsx` |
| `learn_journey_step_viewed` | User navigates to a step of the interactive bill journey (click on a step number, Next, or Back) | `step` (1–7), `step_title`, `method: "next" \| "back" \| "jump"` | `app/learn/components/bill-journey.tsx` |
| `learn_quiz_answered` | User answers a civics-quiz question | `question` (1–5), `correct` | `app/learn/components/civics-quiz.tsx` |
| `learn_quiz_completed` | User reaches the quiz results screen | `score`, `total` | `app/learn/components/civics-quiz.tsx` |
| `learn_quiz_restarted` | User clicks "Take it again" on the results screen | — | `app/learn/components/civics-quiz.tsx` |

### Podcast cross-promotion

The owner's podcast ("The Federalist Papers: Explained") is promoted in three places:
the home page (full promo section), the Learn page (full promo, "§ 06 — Go deeper")
and the end of every bill detail page (compact promo after the Q&A). The `placement`
property exists to settle, with data, which placements earn their spot.

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `podcast_promo_clicked` | User clicks "Listen on Spotify" / "Listen on Apple Podcasts" in any podcast promo | `placement: "home" \| "learn" \| "bill"`, `platform: "spotify" \| "apple"`, `bill_id` (bill pages only) | `components/podcast-promo.tsx` (rendered by `app/components/dashboard/DashboardClient.tsx`, `app/learn/page.tsx`, `components/bills/bill-details.tsx`) |

### Server-side events (source of truth)

Captured with `posthog-node` from API routes, tied to the same person via the
`X-PostHog-Distinct-Id` / `X-PostHog-Session-Id` headers sent by the browser.

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `bill_chat_message_processed` | Server finished handling a chat message (success, error, or rate-limit) — the billable/costly action | `bill_id`, `success`, `rate_limited`, `user_type`, `question_length` | `app/api/bill-chat/send/route.ts` |
| `$exception` (server) | An API route threw | error details | `app/api/bill-chat/send/route.ts`, `app/api/bill-chat/usage/route.ts` |

---

## Person identification

Implemented in `components/analytics/posthog-auth-sync.tsx` (mounted in `app/layout.tsx`).

- **Anonymous visitors** get an auto-generated PostHog anonymous ID. All pre-signup
  activity is recorded against it.
- When a user **signs in / signs up** (any method), we call
  `posthog.identify(<convex user id>, {...})`. PostHog automatically merges the
  anonymous history into the identified person — so we can see the full journey from
  first visit → signup → usage.
- When a user **signs out** we call `posthog.reset()` so the next person on the same
  device isn't mixed into their profile.

**Person properties** (set on identify, updated on every page load while signed in):

| Property | Meaning |
|---|---|
| `email` | Account email |
| `name` | Display name (if any) |
| `plan` | `free` or `pro` |
| `email_verified` | Whether email verification completed |
| `account_created_at` | Account creation timestamp |

---

## Funnels & insights to build in PostHog (UI work, not code)

These are the saved insights the project should maintain in the PostHog UI:

1. **Sign-up funnel** — `$pageview (/sign-up)` → `signup_form_submitted` → `signup_completed`.
   Where do people abandon account creation?
2. **Rate-limit conversion funnel** — `bill_chat_rate_limited` → `rate_limit_signup_clicked`
   → `signup_completed`. Does hitting the free limit convert visitors into accounts?
3. **Discovery-to-engagement funnel** — `$pageview (/bills)` → `bill_card_clicked` →
   `bill_viewed` → `bill_chat_question_submitted`. Where does interest drop off?
4. **Activation** — `signup_completed` → `bill_chat_question_submitted` within 1 day.
5. **Trends**: daily `signup_completed` (by method), daily `bill_chat_question_submitted`
   (by user_type), daily unique visitors, `bills_no_results` rate.
   Also: `podcast_promo_clicked` broken down by `placement` (and against page views of
   each placement's page) — decides whether each promo placement keeps its spot.
6. **Retention**: weekly retention on `bill_chat_question_submitted`.
7. **Web analytics dashboard**: PostHog's built-in one (enabled by default).

---

## Configuration

| Env var | Value | Where it lives |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | The project's public API key (`phc_…`) | `.env.local` for local dev **and** a GitHub Actions repo secret for deploys |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://t.billsincongress.com` (reverse proxy — see below) | `.env.local` for local dev **and** a GitHub Actions repo secret for deploys |

- The key is a **public** client key (it ships in the JS bundle by design); it is not a secret.
- If PostHog env vars are missing, all analytics code no-ops — the site works fine without them.
- Both vars are **build-time**, and deploys run in CI (`.github/workflows/deploy.yml`, and
  `ci.yml` for builds). Changing either one means updating **both** `.env.local` and the
  GitHub repo secret (`gh secret set <NAME>`) — updating only the local file has no effect
  on production.

### Reverse proxy (managed by PostHog)

Events are sent to `https://t.billsincongress.com`, a **PostHog managed reverse proxy**
on our own domain, so ad-blockers that blocklist `*.posthog.com` don't silently drop
events. Set up 2026-08-05.

How it works:

- A `CNAME` record for `t` in the `billsincongress.com` Cloudflare zone points at a
  PostHog-issued target (`…​.cf-prod-us-proxy.proxyhog.com`).
- The record **must stay "DNS only" (grey cloud)** in Cloudflare. Turning the orange
  cloud on breaks PostHog's SSL provisioning.
- PostHog issues and renews the certificate; there is nothing for us to maintain and it
  is free on PostHog Cloud.
- The subdomain is deliberately generic (`t`, not `analytics`/`ph`/`posthog`) because
  ad-blockers blocklist those words.
- Managed in PostHog under Settings → Managed reverse proxy.

Notes:

- `ui_host` stays `https://us.posthog.com` so toolbar/replay links point at the real app.
- Both browser events and server-side events (`lib/posthog-server.ts`) go through the
  proxy, since both read `NEXT_PUBLIC_POSTHOG_HOST`.
- This replaces the previously-planned custom Cloudflare Worker proxy — no Worker needed.
  A Next.js `/ingest` rewrite is still **not safe** on OpenNext/Cloudflare (known
  ETag/304 and redirect bugs), so don't reintroduce one.

### PostHog CLI

`@posthog/cli` is installed as a dev dependency (`npx posthog-cli --help`).
Used for sourcemap uploads (error tracking readability) and ad-hoc queries.
Authenticate once with `npx posthog-cli login`.

---

## Retired events

_None yet. When a feature is removed, move its registry rows here with the removal date._
