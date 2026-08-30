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

6. **No identity data in event properties.** Email, name and account id go on the
   **person profile** via `identify()`, never on individual events.
   Reader-typed free text does reach event properties today, deliberately, because knowing
   what people ask and what they searched for and did not find is the point of collecting it:
   `answer_question_submitted.question` (the whole question), `bills_no_results.title_query`
   (the raw search box), and — less obviously — `answer_question_submitted.scope_label` and
   `answer_starter_clicked.starter_text`, both of which interpolate the reader's typed title
   search into a label. Both are disclosed in the Privacy Policy — the AI question in §3,
   the no-results search text in §2. Adding another free-text property is a privacy decision,
   not a routine one: raise it explicitly and update the Privacy Policy in the same change.

---

## What PostHog captures automatically (no code needed)

**Only one of these is configured in code.** `instrumentation-client.ts` sets exactly six
keys — `api_host`, `ui_host`, `defaults: '2026-01-30'`, `capture_exceptions: true`,
`debug`, and `before_send`. Everything else in the table below comes from the
`defaults: '2026-01-30'` preset plus **PostHog project settings** (remote config), which
means it can be changed by someone in the PostHog UI with no commit here. There is no
`session_recording`, `autocapture`, `enable_heatmaps` or masking key anywhere in this
repository.

| Capture | What it gives us | Turned on by |
|---|---|---|
| `$pageview` / `$pageleave` | Every page visited, time on page, exit pages, full URL, referrer | `defaults` preset |
| `$autocapture` | Every click on links/buttons/inputs across the whole site (incl. nav, footer, Learn/About CTAs) | `defaults` preset + project setting `autocapture_opt_out: null` |
| Session replay | Video-style recordings of real sessions, console logs, network perf | Project setting `session_recording_opt_in: true` |
| Web vitals | LCP, CLS, FCP, INP per page | Project setting `autocapture_web_vitals_opt_in: true` |
| `$exception` | Uncaught JS errors and unhandled promise rejections (Error Tracking) — third-party noise filtered, see below | **Code**: `capture_exceptions: true` (also on project-side as `autocapture_exceptions_opt_in`, but the init key is what makes it independent of the UI toggle) |
| Heatmaps | Click/move/scroll-depth maps per page (rendered from autocapture data) | Project setting `heatmaps_opt_in: true` |
| `$rageclick` | Repeated frustrated clicks on the same element | `defaults` preset |

Project-side settings worth knowing when reading this data, because none of them are
visible in the repo:

| Setting | Value | Consequence |
|---|---|---|
| `session_recording_masking_config` | `null` | No masking is configured here — replays fall back to posthog-js defaults, which **mask the value of every input** (the ask box, the auth forms) but do **not** mask ordinary on-page text. So a question is hidden while it is being typed and visible again the moment the transcript renders it back as text. Text masking, not input masking, is what is missing. |
| `session_recording_retention_period` | `30d` | Replays are deleted after 30 days; older sessions cannot be reviewed. |
| `session_recording_sample_rate` | `null` | Every session is recorded, not a sample. |
| `capture_console_log_opt_in` | `true` | Console output is captured inside replays. |
| `anonymize_ips` | `false` | IPs reach PostHog and are used for city-level geo. |
| `event_retention_months` | `84` | Retention is *configured* at 84 months, but enforcement is off on this project, so no product event has actually been deleted yet. |
| `capture_dead_clicks` | `false` | No `$dead_click` events. |
| `test_account_filters` | person not in cohort `341621` | The "internal users" filter in the UI relies on this cohort. |

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
`/privacy`) intentionally have **no custom code** — their clicks are covered by autocapture.
Four CTAs carry a `data-ph-capture-attribute-*` tag so they can be filtered by name in
PostHog: `about-github` and `about-browse-bills` (`app/about/page.tsx`),
`learn-browse-bills` (`app/learn/page.tsx`) and `home-browse-bills`
(`components/dashboard/DashboardClient.tsx`). The legal pages carry **no** such tags —
they have no analytics markup of any kind. The Learn page is interactive (civics guide)
and fires its own custom events — see "Learn page" below.

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
| `dashboard_drilldown_clicked` | User clicks any dashboard stat/chart that drills into the bills data (status bar, policy area, sponsor, state, metric). Destination is a filtered `/bills` URL, except a policy area on the newest Congress, which goes to that topic's hub page | `filter_type`, `filter_value`, `congress` | `components/dashboard/DashboardClient.tsx` |
| `bills_filter_applied` | A filter moves off its default or changes value. Fires from one chokepoint, so it cannot drift per control | `filter_kind`, `filter_value` (omitted for `title` and `sponsor`), `query_length` (`title` only), `sponsor_count` (`sponsor` only), `surface`, `active_filter_count` | `app/bills/bills-client.tsx` |
| `bills_filter_removed` | A filter returns to its default outside the empty-result state | `filter_kind`, `surface`, `active_filter_count` | `app/bills/bills-client.tsx` |
| `bills_filter_panel_opened` | A filter picker or the "All filters" panel opens | `filter_kind` (or `"all"`), `layout`, `active_filter_count` | `components/bills/filters/filter-field.tsx`, `components/bills/filters/all-filters-panel.tsx` |
| `bills_filter_panel_closed` | It closes | `filter_kind`, `layout`, `changes_made`, `dwell_ms`, `active_filter_count` | `components/bills/filters/filter-field.tsx` |
| `bills_filter_search_used` | In-picker search settles (500ms debounce, once per settled query) | `filter_kind`, `query_length`, `result_count`, `selected` | `components/bills/filters/option-list.tsx` |
| `bills_congress_scope_changed` | Reader switches which Congress /bills is showing | `congress`, `active_filter_count` | `components/bills/filters/congress-scope.tsx` |
| `bills_results_truncated` | The backend reported the results list as a sample rather than the whole set (passive, once per filter set) | `filter_kinds`, `shown`, `known_total` | `app/bills/bills-client.tsx` |
| `bills_filters_cleared` | User clicks "Clear all" filters | `active_filter_count`, `surface` | `app/bills/bills-client.tsx`, `components/bills/filters/filter-bar.tsx`, `components/bills/filters/all-filters-panel.tsx` |
| `bills_load_more_clicked` | User clicks "Load more bills" | `next_page`, `loaded_count` | `app/bills/bills-client.tsx` |
| `bills_no_results` | A filtered search returned zero bills (UX friction signal) | `active_filter_count`, `query_length` | `app/bills/bills-client.tsx` |
| `bills_no_results_filter_removed` | User drops one filter via a chip in the empty-result state — measures whether the dead-end escape hatch works, and which filter people blame first | `filter_kind`, `active_filter_count` | `app/bills/bills-client.tsx` |
| `bill_card_clicked` | User clicks a bill card in the results grid | `bill_id`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage` | `components/bills/bill-card.tsx` |
| `hub_viewed` | A topic / chamber / status hub page was rendered (passive, once per view+page) | `hub_kind`, `hub_path`, `bill_count`, `page` | `app/bills/_hub/hub-view-tracker.tsx` |
| `hub_link_clicked` | User clicks a link into a hub from the /bills browse disclosure, a filter picker footer, or a sibling row on another hub. **Not** the homepage policy-area rows, which link to a topic hub but report `dashboard_drilldown_clicked` instead | `from_path`, `to_path`, `hub_kind`, `placement` | `app/bills/_hub/hub-view-tracker.tsx`, `app/bills/_hub/hub-directory.tsx`, `components/bills/filters/filter-field.tsx` |

**`filter_kind` vocabulary** (shared by `bills_filter_applied`,
`bills_filter_removed`, `bills_filter_panel_*` and
`bills_no_results_filter_removed`, and defined once in
`lib/bills/filter-registry.ts`): `title`, `bill_reference`, `bill_number`,
`status`, `policy_area`, `state`, `bill_type`, `sponsor`, `introduced_date`,
`last_action_date`, `congress`, `chamber`. These are deliberately NOT renamed to
match the reader-facing labels ("Outcome", "Topic", "Sponsor's state") — the
labels are free to change, the metric vocabulary is joined against historical
data and against `dashboard_drilldown_clicked.filter_type`.

**`layout` is the payoff property of the filter redesign.** It records whether a
picker opened as a bottom `sheet` or an anchored `popover`, which is chosen by
the reader's pointer device rather than by screen width. Cross-tabbing
`bills_filter_panel_closed.changes_made` by `layout` is the only way to find out
whether one of the two surfaces underperforms for this audience; `dwell_ms` by
`filter_kind` says whether putting a filter behind a tap cost anything.

**No raw reader text on any of these events.** `title` sends `query_length` and
`sponsor` sends `sponsor_count`. `bills_no_results` was changed in the same
commit to send `query_length` instead of the raw `title_query` it used to carry;
the property is additive-by-replacement, so historic `title_query` data is
untouched and no saved insight breaks.

**`bills_no_results` volumes before 2026-08-29 are inflated and not comparable.**
The search box had no debounce, so every keystroke fired a query and every
intermediate prefix that matched nothing fired this event — 10,597 events from
1,436 people in 90 days, with a query-length distribution decaying smoothly from
one character. The 250ms debounce added with the filter redesign means it now
fires roughly once per settled search.

### Bill detail & AI chat

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `bill_viewed` | Bill detail page rendered (top of the chat funnel) | `bill_id`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage`, `has_summary`, `has_pdf` | `components/bills/bill-details.tsx` |
| `bill_base_rate_viewed` | Committee base-rate context line shown on a bill detail page (passive, once per bill view) | `bill_id`, `chamber`, `days_in_committee`, `base_rate_percent`, `base_rate_sample` | `components/bills/bill-details.tsx` |
| `bill_pdf_opened` | User clicks "Read full text (PDF)" | `bill_id` | `components/bills/bill-details.tsx` |
| `bill_save_toggled` | Signed-in user saves or unsaves a bill on the detail page | `bill_id`, `action: "saved" \| "unsaved"`, `bill_type`, `bill_number`, `congress`, `policy_area`, `progress_stage` | `components/bills/save-bill-button.tsx` |
| `bill_save_signin_redirected` | Signed-out user clicked Save and was sent to sign-in (conversion moment) | `bill_id` | `components/bills/save-bill-button.tsx` |
| `rate_limit_signup_clicked` | User clicks "Sign up free" in the rate-limit dialog (key conversion moment) | `limit_kind` | `components/bills/rate-limit-dialog.tsx`, now rendered only from `components/answers/answer-panel.tsx` |
| `rate_limit_signin_clicked` | User clicks "I have an account" in the rate-limit dialog | `limit_kind` | `components/bills/rate-limit-dialog.tsx`, same render site |

> **Reading `has_summary`.** It means "Congress has published a CRS summary for
> this bill" — nothing more. Since 18 Aug 2026 every bill page also renders an
> "At a glance" paragraph built from the bill's own fields, so `has_summary:
> false` no longer implies the page had no prose on it. The property is
> deliberately unrenamed: existing insights and funnels are built on it.

### Grounded answers

The answer engine that replaces prompt-stuffed bill chat. `surface` names where the
question was asked, so one funnel covers every place the thread is mounted rather than
one funnel per page. `surfaceFor()` lives in `lib/page-context.ts`, where it is
unit-tested (it used to be inline and untested in `answer-provider.tsx`), and emits
exactly four values: **`home`** (path `/`), **`bill`**
(`/bills/<id>`), **`filtered`** (any other `/bills…` path, and any scoped ask) and
**`other`** (everywhere else). A fifth, **`panel`**, is passed literally by the two
click events fired from inside the panel (`answer_source_clicked`,
`answer_entity_clicked`), which describe a place rather than a page. No code path
emits `list`.

> Corrected 29 Aug 2026: `surfaceFor` used to treat any single segment under `/bills/`
> as a bill id, so the seven hub routes (`/bills/enacted`, `/bills/house`, …) reported
> `surface: "bill"`. They now correctly report `filtered`. Readings of `bill` before that
> date include hub traffic.
>
> Also corrected that day: `answer_panel_opened` used to report `surface: "panel"` on
> every open. It now reports the page the reader opened it from, which is what makes it
> comparable with the rest of the family.

| Event | Fired when | Properties | Where (file) |
|---|---|---|---|
| `answer_question_submitted` | Reader submits a question | `surface`, `question`, `question_length`, `source: "typed" \| "starter"`, `question_number`, `scope_label` (filtered lists only) | `components/answers/answer-provider.tsx` |
| `answer_received` | Answer completed | `surface`, `response_ms`, `answer_length`, `db_source_count`, `web_source_count`, `dropped`, `partial` | `components/answers/answer-provider.tsx` |
| `answer_failed` | Request errored (not rate limit) | `surface`, `error` — one of the server's message, `"stream_incomplete"`, `"network_error"` | `components/answers/answer-provider.tsx` |
| `answer_source_clicked` | A numbered source was clicked | `surface`, `source_kind: "db" \| "web"`, `position` | `components/answers/source-list.tsx` |
| `answer_citation_unresolved` | The server deleted a citation the model invented | `surface`, `marker_count`, `model` — a hardcoded `'deepseek-v4-flash'` literal, **not** the model that actually served the turn, so it cannot detect a failover | `components/answers/answer-provider.tsx` |
| `answer_rate_limited` | Reader hit the daily question cap | `surface`, `limit_kind: "anonymous" \| "authed"`, `max` | `components/answers/answer-provider.tsx` |
| `answer_entity_clicked` | A bill card or chip inside an answer was clicked | `surface`, `entity_kind: "bill" \| "sponsor" \| "topic" \| "state"`, `position`, `entity_id` | `components/answers/entity-block.tsx` |
| `answer_panel_opened` | The persistent ask panel was opened | `surface`, `trigger: "launcher" \| "bill_page" \| "hero" \| "starter" \| "ask" \| "manual"`, `has_conversation` | `components/answers/answer-provider.tsx` |
| `answer_panel_closed` | The panel was dismissed, or stepped aside for a page the reader opened from it | `surface`, `reason: "manual" \| "escape" \| "swipe" \| "entity_navigation" \| "navigation"`, `turn_count`, `dwell_ms` | `components/answers/answer-provider.tsx` |
| `answer_panel_restored` | A set-aside conversation was reopened from the launcher | `surface`, `trigger: "launcher"`, `turn_count`, `away_ms` | `components/answers/answer-provider.tsx` |
| `answer_panel_resized` | The docked panel's width was changed by drag, keyboard or a double-click reset | `surface`, `width_px`, `width_pct`, `viewport_width`, `method: "drag" \| "keyboard" \| "reset"` | `components/answers/resize-handle.tsx` |
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

### Server-side events

Captured with `posthog-node` (`lib/posthog-server.ts`) from API routes, tied to the same
person via the `X-PostHog-Distinct-Id` / `X-PostHog-Session-Id` headers sent by the browser.

| Event | Fired when | Properties | Where (file) | Status |
|---|---|---|---|---|
| `bill_chat_message_processed` | Server finished handling a per-bill chat message | `bill_id`, `success`, `rate_limited`, `user_type`, `question_length` | `app/api/bill-chat/send/route.ts` | **Dead.** The route is still deployed and publicly callable, but its only client (`billsService.sendChatMessage`) has no call site anywhere in the app. Last event 27 Aug 2026. |
| `$exception` (server) | An API route threw | error details | `app/api/bill-chat/send/route.ts` (dead), `app/api/bill-chat/usage/route.ts` (live, called by `app/account/page.tsx`) | Partly live |

> **The live answer path has no server-side instrumentation at all.**
> `app/api/answer/route.ts` imports nothing from `lib/posthog-server.ts`, and the
> browser's `fetch('/api/answer')` does not send the PostHog identity headers, so a
> server event added there today would not attach to the browser's person or session.
> Everything we know about answers comes from the client events above — which means a
> question that fails before the browser sees a response is invisible. If server-side
> truth for the costly action matters again, this is the gap to close, and it needs
> `analytics.requestHeaders()` wired into that fetch first.

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

**Person properties.** The first four are `$set` (overwritten on every page load while
signed in). `account_created_at` is `$set_once` — written the first time and never
updated, so it stays the true account age.

| Property | How | Meaning |
|---|---|---|
| `email` | `$set` | Account email |
| `name` | `$set` | Display name (if any) |
| `plan` | `$set` | `free` or `pro`. Nothing in the codebase ever sets `pro`; there is no billing. |
| `email_verified` | `$set` | Whether email verification completed |
| `account_created_at` | `$set_once` | Account creation timestamp (ISO string) |

Google sign-in cannot be observed at click time on the return leg, so the intent is
stashed in `sessionStorage` under `ph_pending_google_auth` when the button is clicked and
consumed after the redirect. A returning Google user counts as a **sign-up** rather than a
sign-in if the account is less than 10 minutes old (`FRESH_ACCOUNT_WINDOW_MS`).

---

## Funnels & insights in PostHog (UI work, not code)

**26 saved insights already exist, and six are broken.** Five still query the retired
`bill_chat_*` events and have been flat since 27 Aug 2026, when bill chat was replaced. The
sixth is unrelated: it queries `bills_filters_applied` and has been flat since 13 Jun 2026.
Rebuild them on the `answer_*` equivalents:

| Broken insight | short_id | Still queries | Rebuild on |
|---|---|---|---|
| AI chat questions per day (anonymous vs signed-in) | `AhBFHb00` | `bill_chat_question_submitted` | `answer_question_submitted`, break down by `surface` |
| Activation: sign-up → first AI question | `eYbtcY58` | `signup_completed` → `bill_chat_question_submitted` | `signup_completed` → `answer_question_submitted` |
| Bill discovery → AI chat funnel | `qcr4jGHS` | `bill_chat_question_submitted` as the last step | `answer_question_submitted` |
| Weekly retention: AI chat users | `V2vWhvQ3` | `bill_chat_question_submitted` | `answer_question_submitted` |
| Rate limit → sign-up conversion | `cztOt3GV` | `bill_chat_rate_limited` | `answer_rate_limited` |
| Bill searches & filters applied per day | `pI36FO07` | `bills_filters_applied` | Nothing yet — filter usage is uninstrumented, see "Known gap" below |

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
10. **Step-aside and return rate** — `answer_entity_clicked` →
    `answer_panel_closed (reason: entity_navigation)` → `answer_panel_restored`, split by
    viewport width. This is the number that says whether the mobile fix worked: readers
    used to tap a bill inside an answer and see nothing happen, because the sheet covered
    the page it had just opened. A large first drop means the panel is not stepping aside;
    a large second drop means readers cannot find their way back to the conversation.
11. **Cold asks** — `answer_panel_opened` where `has_conversation` is false, split by
    `surface`. The always-available launcher exists so that a reader on a hub page or the
    Learn guide — pages with no ask box of their own — can ask anything at all. This
    number was impossible to record before it, because the old pill only appeared once a
    conversation already existed.
12. **Web analytics dashboard**: PostHog's built-in one (enabled by default).

---

## Configuration

| Env var | Value | Where it lives |
|---|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | The project's public API key (`phc_…`) | `.env.local` for local dev **and** a GitHub Actions repo secret for deploys |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://t.billsincongress.com` (reverse proxy — see below). Note `.env.example` ships the direct `https://us.i.posthog.com` value, and that is also the code fallback when the variable is unset — the proxy is in effect only because the GitHub Actions secret is set to it | `.env.local` for local dev **and** a GitHub Actions repo secret for deploys |

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
Authenticate once with `npx posthog-cli login`. It is used **manually only** — for ad-hoc
queries. No `package.json` script and no GitHub workflow invokes it, so despite what an
earlier version of this file said, **sourcemaps are not uploaded**. Stack traces in Error
Tracking are therefore against minified production bundles. Wiring sourcemap upload into
`cf:build` is an open improvement, not something that already happens.

---

## Wired in code but never observed

As of 29 Aug 2026, seven registered events had never been received once. Each is either a
genuinely rare path or a broken one, and the difference matters — an event that *cannot*
fire is a silent instrumentation bug, not a quiet feature. The seven filter-redesign events
shipped the same day and are deliberately left out of this table: they need a week of
traffic before their absence tells you anything.

| Event | Most likely explanation |
|---|---|
| `signup_verification_code_resent` | Rare path — few people need to resend the code. |
| `signup_failed` | Rare path — only fires on a failed password-rules check or a wrong code. |
| `hub_link_clicked` | Hub pages only shipped 18 Aug 2026, and until the /bills browse disclosure and the filter-picker footers landed, the only way to fire this was a sibling row far down a hub page. |
| `rate_limit_signin_clicked` | Rare — few readers hit the cap and already have an account. |
| `answer_rate_limited` | Expected to be rare while answer volume is low, but worth watching: it is the top of the rate-limit conversion funnel. |
| `answer_thread_deleted` | Requires a signed-in reader to delete a saved conversation. |
| `answer_anon_thread_saved` | Requires signing in mid-conversation and choosing "Keep it". |

Before assuming any of these is simply rare, check it can fire at all — the answer-family
events only started arriving on 27 Aug 2026, so this list should be re-read once the
feature has real usage behind it.

---

## Retired events

| Event | Properties | Retired | Why |
| --- | --- | --- | --- |
| `bill_chat_question_submitted` | `bill_id`, `question`, `question_length`, `source`, `question_number`, `user_type` | 2026-08-26 | Replaced by `answer_question_submitted` when bill chat became the grounded answer panel. Deliberately not renamed — renaming breaks saved insights and funnels. `surface: "bill"` is the closest equivalent of the old `bill_id`-scoped view. |
| `bill_chat_answer_received` | `bill_id`, `response_ms`, `answer_length` | 2026-08-26 | Replaced by `answer_received`, which adds source counts and the grounding-health `dropped` property. |
| `bill_chat_failed` | `bill_id`, `error` | 2026-08-26 | Replaced by `answer_failed`. |
| `bill_chat_rate_limited` | `bill_id`, `limit_kind`, `max` | 2026-08-26 | Replaced by `answer_rate_limited`. The rate-limit dialog and its two conversion events (`rate_limit_signup_clicked`, `rate_limit_signin_clicked`) are unchanged and still live. |
| `bills_filters_applied` | `status`, `bill_type`, `congress`, `state`, `policy_area`, `introduced_date`, `last_action_date`, `title_query`, `bill_number`, `sponsor_count`, `active_filter_count` | 2026-06-13 | The "Apply filters" button it fired from was removed when the mobile filter sheet became an always-visible inline filter bar, and filters now apply as they change. The event had no call site from that commit onward, so no data has been collected since — this row only formalises a removal that already happened in the code. Historic data before then is still in PostHog. (This row previously recorded the date as 2026-08-12, which was when the removal was written down rather than when it happened; the last event actually arrived 13 Jun 2026.) |

**Gap now closed (2026-08-29).** Filter *usage* was uninstrumented from the
removal of this event until the bills filter redesign — there was no way to see
which filters people applied, only `bills_no_results` when a combination
returned nothing, which is how a completely broken topic filter went unnoticed.
`bills_filter_applied` and `bills_filter_removed` now cover it, per change
rather than per Apply click. The old name was deliberately not revived: reusing
it would silently merge two different semantics in historic charts.
