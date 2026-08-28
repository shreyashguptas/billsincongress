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
| `$exception` | Uncaught JS errors and unhandled promise rejections (Error Tracking) — third-party noise filtered, see below |
| Heatmaps | Click/move/scroll-depth maps per page (rendered from autocapture data) |

> **`$exception` is filtered before it is sent.** Since 26 Aug 2026,
> `instrumentation-client.ts` passes a `before_send` hook that drops exceptions
> raised by software that is not this site: Microsoft Outlook's link scanner,
> browser-extension messaging failures, and the browser's own opaque
> `Script error.` reports that arrive with no stack frames. Those were roughly
> 300 of the ~320 exceptions recorded in the preceding ten weeks, which made the
> error count unreadable rather than merely wrong.
>
> The rules live in `lib/error-filter.ts` with the reasoning for each, and are
> tested against verbatim production messages in `lib/error-filter.test.ts`.
> Anything that this codebase could plausibly have caused is deliberately kept,
> including `SecurityError: The operation is insecure.` and
> `TypeError: Failed to fetch` — a dropped event cannot be investigated later.
>
> Two consequences when reading error charts: exception counts before and after
> 26 Aug 2026 are not comparable, and **only `$exception` is filtered** — every
> product event in the tables below is sent exactly as it was.

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
| `dashboard_congress_selected` | User switches Congress on the home dashboard | `congress` | `components/dashboard/DashboardClient.tsx` |
| `dashboard_drilldown_clicked` | User clicks any dashboard stat/chart that drills into /bills (status bar, policy area, sponsor, state, metric) | `filter_type`, `filter_value`, `congress` | `components/dashboard/DashboardClient.tsx` |
| `bills_filters_cleared` | User clicks "Clear all" filters | — | `app/bills/bills-client.tsx` |
| `bills_load_more_clicked` | User clicks "Load more bills" | `next_page`, `loaded_count` | `app/bills/bills-client.tsx` |
| `bills_no_results` | A filtered search returned zero bills (UX friction signal) | `active_filter_count`, `title_query` | `app/bills/bills-client.tsx` |
| `bills_no_results_filter_removed` | User drops one filter via a chip in the empty-result state — measures whether the dead-end escape hatch works, and which filter people blame first | `filter_kind`, `active_filter_count` | `app/bills/bills-client.tsx` |
| `bill_card_clicked` | User clicks a bill card in the results grid | `bill_id`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage` | `components/bills/bill-card.tsx` |
| `hub_viewed` | A topic / chamber / status hub page was rendered (passive, once per view+page) | `hub_kind`, `hub_path`, `bill_count`, `page` | `app/bills/_hub/hub-view-tracker.tsx` |
| `hub_link_clicked` | User clicks a link from one hub to a sibling hub | `from_path`, `to_path`, `hub_kind` | `app/bills/_hub/hub-view-tracker.tsx` |

### Bill detail & AI chat

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `bill_viewed` | Bill detail page rendered (top of the chat funnel) | `bill_id`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage`, `has_summary`, `has_pdf` | `components/bills/bill-details.tsx` |
| `bill_base_rate_viewed` | Committee base-rate context line shown on a bill detail page (passive, once per bill view) | `bill_id`, `chamber`, `days_in_committee`, `base_rate_percent`, `base_rate_sample` | `components/bills/bill-details.tsx` |
| `bill_pdf_opened` | User clicks "Read full text (PDF)" | `bill_id` | `components/bills/bill-details.tsx` |
| `bill_save_toggled` | Signed-in user saves or unsaves a bill on the detail page | `bill_id`, `action: "saved" \| "unsaved"`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage` | `components/bills/save-bill-button.tsx` |
| `bill_save_signin_redirected` | Signed-out user clicked Save and was sent to sign-in (conversion moment) | `bill_id` | `components/bills/save-bill-button.tsx` |
| `rate_limit_signup_clicked` | User clicks "Sign up free" in the rate-limit dialog (key conversion moment) | `limit_kind` | `components/bills/rate-limit-dialog.tsx` |
| `rate_limit_signin_clicked` | User clicks "I have an account" in the rate-limit dialog | `limit_kind` | `components/bills/rate-limit-dialog.tsx` |

> **Reading `has_summary`.** It means "Congress has published a CRS summary for
> this bill" — nothing more. Since 18 Aug 2026 every bill page also renders an
> "At a glance" paragraph built from the bill's own fields, so `has_summary:
> false` no longer implies the page had no prose on it. The property is
> deliberately unrenamed: existing insights and funnels are built on it.

### Grounded answers

The answer engine that replaces prompt-stuffed bill chat. `surface` names where the
question was asked (`bill`, `home`, `panel`, `list`), so one funnel covers every place
the thread is mounted rather than one funnel per page.

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `answer_question_submitted` | Reader submits a question | `surface`, `question`, `question_length`, `source: "typed" \| "starter"`, `question_number`, `scope_label` (filtered lists only) | `components/answers/answer-thread.tsx` |
| `answer_received` | Answer completed | `surface`, `response_ms`, `answer_length`, `db_source_count`, `web_source_count`, `dropped`, `partial` | `components/answers/answer-thread.tsx` |
| `answer_failed` | Request errored (not rate limit) | `surface`, `error` | `components/answers/answer-thread.tsx` |
| `answer_source_clicked` | A numbered source was clicked | `surface`, `source_kind: "db" \| "web"`, `position` | `components/answers/source-list.tsx` |
| `answer_citation_unresolved` | The server deleted a citation the model invented | `surface`, `marker_count`, `model` | `components/answers/answer-thread.tsx` |
| `answer_rate_limited` | Reader hit the daily question cap | `surface`, `limit_kind: "anonymous" \| "authed"`, `max` | `components/answers/answer-thread.tsx` |
| `answer_entity_clicked` | A bill card or chip inside an answer was clicked | `surface`, `entity_kind: "bill" \| "sponsor" \| "topic" \| "state"`, `position`, `entity_id` | `components/answers/entity-block.tsx` |
| `answer_panel_opened` | The persistent ask panel was opened | `surface`, `trigger` | `components/answers/answer-panel.tsx` |
| `answer_survived_navigation` | Reader asked a follow-up after navigating to another page mid-conversation | `from_surface`, `to_surface`, `turn_number` | `components/answers/answer-provider.tsx` |
| `answer_history_opened` | Signed-in reader opened their saved conversations | `chat_count` | `components/answers/history-list.tsx` |
| `answer_history_thread_resumed` | Signed-in reader reopened a past conversation | `thread_id`, `age_days`, `message_count` | `components/answers/history-list.tsx` |
| `answer_thread_deleted` | Reader deleted one conversation or all of them | `scope: "one" \| "all"`, `thread_count` | `components/answers/history-list.tsx` |
| `answer_anon_thread_saved` | A signed-out conversation was kept after signing in | `turn_count` | `components/answers/answer-provider.tsx` |
| `answer_starter_clicked` | A generated starter or chart question was used | `surface: "home" \| "filtered" \| "bill"`, `starter_text` | `components/answers/hero-ask.tsx`, `components/answers/ask-about.tsx`, `components/answers/scope-ask-bar.tsx`, `components/bills/ask-about-bill.tsx` |
| `answer_web_search_used` | The answer fell back to the open web | `surface`, `reason`, `result_count`, `engine` | `components/answers/answer-provider.tsx` |

> **`dropped` is the grounding-health number.** It counts citations the model
> produced for rows it was never handed, which the server deletes before display.
> Zero is the expected value. A rising line means the catalog's `gotchas` in
> `convex/catalog/datasets.ts` need strengthening — that is the fix, not a prompt
> patch elsewhere.

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
| `podcast_promo_clicked` | User clicks "Listen on Spotify" / "Listen on Apple Podcasts" in any podcast promo | `placement: "home" \| "learn" \| "bill"`, `platform: "spotify" \| "apple"`, `bill_id` (bill pages only) | `components/podcast-promo.tsx` (rendered by `components/dashboard/DashboardClient.tsx`, `app/learn/page.tsx`, `components/bills/bill-details.tsx`) |

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
2. **Rate-limit conversion funnel** — `answer_rate_limited` → `rate_limit_signup_clicked`
   → `signup_completed`. Does hitting the free limit convert visitors into accounts?
3. **Discovery-to-engagement funnel** — `$pageview (/bills)` → `bill_card_clicked` →
   `bill_viewed` → `answer_question_submitted`. Where does interest drop off?
4. **Activation** — `signup_completed` → `answer_question_submitted` within 1 day.
5. **Trends**: daily `signup_completed` (by method), daily `answer_question_submitted`
   (by surface), daily unique visitors, `bills_no_results` rate.
   Also: `podcast_promo_clicked` broken down by `placement` (and against page views of
   each placement's page) — decides whether each promo placement keeps its spot.
6. **Retention**: weekly retention on `answer_question_submitted`.
7. **Grounding health** — daily `answer_citation_unresolved`, and `dropped` on
   `answer_received`. This is the metric that says whether answers are actually
   anchored to our data. A rising line means the catalog's gotchas need
   strengthening. Give it a dashboard tile.
8. **Fallback discipline** — `answer_web_search_used` as a share of `answer_received`.
   It should be a small minority. A rising share means our catalog has a real gap,
   or the fallback-only rule has stopped holding.
9. **Where intent actually lives** — `answer_question_submitted` split by `surface`.
   The spec's bet is that `filtered` converts best per impression. If it does not,
   the ask bar is in the wrong place.
10. **Web analytics dashboard**: PostHog's built-in one (enabled by default).

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

| Event | Properties | Retired | Why |
| --- | --- | --- | --- |
| `bill_chat_question_submitted` | `bill_id`, `question`, `question_length`, `source`, `question_number`, `user_type` | 2026-08-26 | Replaced by `answer_question_submitted` when bill chat became the grounded answer panel. Deliberately not renamed — renaming breaks saved insights and funnels. `surface: "bill"` is the closest equivalent of the old `bill_id`-scoped view. |
| `bill_chat_answer_received` | `bill_id`, `response_ms`, `answer_length` | 2026-08-26 | Replaced by `answer_received`, which adds source counts and the grounding-health `dropped` property. |
| `bill_chat_failed` | `bill_id`, `error` | 2026-08-26 | Replaced by `answer_failed`. |
| `bill_chat_rate_limited` | `bill_id`, `limit_kind`, `max` | 2026-08-26 | Replaced by `answer_rate_limited`. The rate-limit dialog and its two conversion events (`rate_limit_signup_clicked`, `rate_limit_signin_clicked`) are unchanged and still live. |
| `bills_filters_applied` | `status`, `bill_type`, `congress`, `state`, `policy_area`, `introduced_date`, `last_action_date`, `title_query`, `bill_number`, `sponsor_count`, `active_filter_count` | 2026-08-12 | The "Apply filters" button it fired from was removed when the mobile filter sheet became an always-visible inline filter bar, and filters now apply as they change. The event had no call site from that commit onward, so no data has been collected since — this row only formalises a removal that already happened in the code. Historic data before then is still in PostHog. |

**Known gap this leaves:** filter *usage* is no longer instrumented at all, so
there is no way to see which filters people apply (only `bills_no_results` when
a combination returns nothing). That blind spot is how a completely broken topic
filter went unnoticed. Re-instrumenting it belongs with the next change to the
bills filter UI rather than with a backend fix.
