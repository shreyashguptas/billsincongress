# Project overview

How billsincongress.com is put together: where the data comes from, how it is stored, how
the AI answers are grounded, and how the whole thing is built and shipped.

For what the site *is* and what a visitor sees, read the [README](../README.md). For
analytics, read [ANALYTICS.md](ANALYTICS.md). For the home-page dashboard and the
precomputed-analytics pattern, read [interactive-dashboard.md](interactive-dashboard.md).
PostHog Self-driving is configured via `pnpm posthog:self-driving` (see
`posthog-setup-report.md` and the Self-driving section in ANALYTICS.md).

Figures were verified against production on **29 August 2026**.

---

## Contents

- [Architecture at a glance](#architecture-at-a-glance)
- [Repository layout](#repository-layout)
- [Routes](#routes)
- [The data pipeline](#the-data-pipeline)
- [The database](#the-database)
- [Convex functions](#convex-functions)
- [The answer engine](#the-answer-engine)
- [Accounts and auth](#accounts-and-auth)
- [Email](#email)
- [Pro: billing and bill alerts](#pro-billing-and-bill-alerts)
- [Sharing and the installed app](#sharing-and-the-installed-app)
- [Environment variables](#environment-variables)
- [Build, test and deploy](#build-test-and-deploy)
- [Hosting and Cloudflare constraints](#hosting-and-cloudflare-constraints)
- [Operations runbook](#operations-runbook)
- [Conventions](#conventions)
- [Dead code and known gaps](#dead-code-and-known-gaps)

---

## Architecture at a glance

```
Congress.gov API v3  (Library of Congress)
      │
      │  nine sync jobs + two alert-email jobs — convex/crons.ts
      ▼
convex/congressApi.ts   sync, reconcile, repair, backfill
      │
      ▼
convex/mutations.ts  ──▶  Convex database (convex/schema.ts)
      │                        │
      │                        ├─▶ precomputed rollups (congressStats, …)
      │                        └─▶ aggregate components (billsByChamber, billsByStage)
      ▼
convex/bills.ts (queries)          convex/answer.ts + convex/catalog/ (grounded answers)
      │                                     │
      │                                     ▼
      │                            Convex HTTP action  POST /answer/stream  (SSE)
      │                                     │
      ▼                                     ▼
Next.js App Router (app/)  ◀──────  app/api/answer/route.ts (cookie-attaching proxy)
      │
      ▼
Cloudflare Worker (OpenNext)  →  billsincongress.com
```

Pro billing and bill alerts sit beside this: Stripe calls the Convex HTTP action
`POST /stripe/webhook` (convex/billing.ts), which is the only writer of `users.plan`, and a
daily cron (convex/alerts.ts) emails followed-bill digests through PostHog Workflows. See
[Pro: billing and bill alerts](#pro-billing-and-bill-alerts).

Two independently deployed halves:

- **Frontend** — Next.js 16 built by OpenNext into a single Cloudflare Worker. Deploys
  automatically on every push to `main`.
- **Backend** — Convex (database, queries, mutations, actions, crons, HTTP actions).
  **Deployed by hand.** Nothing in CI touches it.

They can skew. `app/api/answer/route.ts` has a user-visible error string for exactly that
case: *"The answer service is not deployed yet. Run `npx convex deploy`."*

---

## Repository layout

```
app/                       Next.js App Router — 19 page.tsx files
  page.tsx                 Home dashboard (server) → components/dashboard/DashboardClient
  bills/                   Browser, bill detail, and the 40 hub pages
    [id]/page.tsx          One bill
    [id]/share-image/      Its share card, drawn on request (next/og)
    [id]/get-bill.ts       The bill lookup the page and the card share
    _hub/                  Hub view, directory and view-tracker (route-private)
    topic/[slug]/          33 policy-area hubs
    house|senate|enacted|in-committee|passed-one-chamber|introduced|vetoed/
  learn/                   How Congress works, in pictures (server-rendered)
    components/            Route-private: the SVG pictures (built on components/brand/pictures.tsx), the hemicycle maths, the state picker
  about/ privacy/ terms/   Content and legal
  pro/                     The Pro plan page, in pictures (server-rendered; the subscribe panel is the only client code)
  account/                 The only signed-in page. page.tsx reads Convex; account-view.tsx draws it
  sign-in/ sign-up/ forgot-password/
  api/                     answer/, bill-chat/send, bill-chat/usage
  robots.ts sitemap.ts sitemap_index.xml/ llms.txt/ manifest.ts
  layout.tsx template.tsx not-found.tsx shared-metadata.ts globals.css
  error.tsx global-error.tsx   Client error boundaries (recover from a stale-asset chunk failure)

components/                Shared React components
  answers/                 The ask panel: provider, panel, thread, sources, work log, history;
                           hero-ask.tsx + use-bill-suggestions.ts (home box and its bill suggestions)
  brand/                   The design language in code (Documentation/brand.md): logo and
                           chamber mark, stage pill and track, party tag, section header,
                           the picture primitives (pictures.tsx) and the Pro mark (pro-mark.tsx)
  pro/                     Subscribe panel, the Pro pictures, and the Welcome to Pro celebration
                           (welcome-to-pro.tsx + confetti.tsx, lazy-loaded by the account page)
  bills/                   Card, details, save, alert and share buttons
    filters/               The /bills filter band: bar, pills, pickers, all-filters panel
  dashboard/               DashboardClient.tsx (data, Congress switching, drill-down)
    home/                  The home page hero (the chamber) and its chart sections
  ui/                      shadcn/ui components, themed via CSS variables (Documentation/brand.md)
  pwa/                     Installed app: service-worker registration, "Install the app"
  auth/ analytics/ legal/ seo/ theme/
  navigation.tsx footer.tsx podcast-promo.tsx
  convex-client-provider.tsx theme-provider.tsx

hooks/                     use-surface-mode.ts — pointer device, not viewport width

lib/                       Pure client/shared modules — 30 modules + 27 test files, then the folders below
  analytics.ts             Typed PostHog helpers — the only place the browser's
                           posthog.capture() is called. Server events go through
                           lib/posthog-server.ts. Convention only; no guard enforces it.
  seo.ts hubs.ts pagination.ts cacheable-routes.ts indexnow.ts sitemap-ids.ts
  answer-entities.ts answer-format.ts answer-scope.ts search-query-guard.ts
  transcript-cap.ts starter-questions.ts bill-query.ts error-filter.ts
  bill-suggest.ts          Home ask-box bill suggestions: match kind, highlight rules
  chunk-error.ts use-chunk-error-recovery.ts   Error-boundary recovery from stale-asset chunk failures
  pwa.ts                   Installed-app state: display mode, iOS detection, the held install prompt
  og/                      The share card (bill-share-card.tsx, tested) and its embedded fonts (fonts.ts, generated)
  services/bills-service.ts  constants/  types/  utils/

convex/                    Backend — 30 top-level modules + catalog/ + 9 test files
  schema.ts                24 application tables (+ 6 from the auth library)
  bills.ts                 Public read surface
  mutations.ts             All sync writes and rollup writers
  congressApi.ts           Congress.gov sync, reconcile, repair, backfill
  answer.ts catalog/       The grounded answer engine
  chats.ts savedBills.ts users.ts auth.ts   Accounts
  billing.ts alerts.ts email.ts             Pro: Stripe webhook + checkout, bill alerts, alert delivery
  crons.ts rateLimits.ts indexNow.ts aggregates.ts functions.ts http.ts
  billStage.ts chamber.ts baseRates.ts searchQuery.ts syncStatus.ts
  plan.ts alertDigest.ts                    Pure, unit-tested

scripts/                   run-tests.ts, two CI guards, three AI probes, image and font tooling
public/                    Icons, images, _headers, the IndexNow key file, sw.js + offline.html
```

---

## Routes

| URL | What it is |
| --- | --- |
| `/` | Congress dashboard, one Congress at a time (`?congress=` switches) |
| `/bills` | Filterable browser — 10 per page, max page 51 |
| `/bills/<billId>` | One bill. `billId` is `{number}{type}{congress}`, e.g. `261hr119` |
| `/bills/house`, `/bills/senate` | 2 chamber hubs |
| `/bills/introduced`, `/in-committee`, `/passed-one-chamber`, `/enacted`, `/vetoed` | 5 stage hubs |
| `/bills/topic/<slug>` | 33 policy-area hubs, one per CRS policy area |
| `/learn`, `/about`, `/privacy`, `/terms` | Content and legal |
| `/pro` | The Pro plan in pictures: what it adds, the two prices, subscribe buttons (Stripe Checkout), the questions as picture cards |
| `/sign-in`, `/sign-up`, `/forgot-password`, `/account` | Accounts (`/account` is the only protected route). `/account` also shows the plan, today's questions, "Manage billing" (Stripe portal), followed and saved bills |
| `/alerts/unsubscribe?token=` | The unsubscribe link in every alert email. A button, never an action on page load — mail scanners open every link |
| `/api/alerts/unsubscribe` | POST — stops all alert emails for the token's reader. Called by that page and by mail clients' one-click unsubscribe (RFC 8058). No GET, deliberately |
| `/api/answer` | POST — proxies to Convex `/answer/stream`, attaching auth and anonymous cookies, injecting a keep-alive while the stream is silent, and capping a stream that never finishes |
| `/api/bill-chat/usage` | GET — daily quota, read by the account page |
| `/api/bill-chat/send` | POST — **dead**, see [Dead code](#dead-code-and-known-gaps) |
| `/bills/<billId>/share-image?v=` | GET — the bill's share card, a 1200×630 PNG. Named as every bill page's `og:image` and `twitter:image`; see [Sharing](#sharing-and-the-installed-app) |
| `/robots.txt`, `/sitemap_index.xml`, `/sitemap/<n>.xml`, `/llms.txt`, `/manifest.webmanifest` | Machine-readable |
| `/sw.js`, `/offline.html` | The service worker and the one page it serves (static files) |

**Sitemaps** are `/sitemap_index.xml` (a route handler) listing `/sitemap/0.xml` (static pages
and hubs) plus one file per Congress from `app/sitemap.ts`, about 56,000 URLs. Both take their
list from `lib/sitemap-ids.ts`, and both are prerendered at build and revalidated daily. **A
sitemap never answers OK with less than the whole site.** A failed or empty Congress lookup
throws: at build it fails the deploy, keeping the previous one live, and at runtime it is a 5xx
that Google retries while the cache keeps the last good copy. It used to fall back to the
static file alone, and Google read the index exactly once (23 Jun 2026), recorded "Success, 0
discovered pages", and knew 6 of the site's pages for the next three months. A build with no
`NEXT_PUBLIC_CONVEX_URL` at all (a fork's pull request) still produces the static file only.

**Hubs** are defined in `lib/hubs.ts`: 2 chamber + 5 status + 33 topic = **40**. Stage hubs
for 80 / 90 / 95 deliberately do not exist: 90 and 95 are zero in all three Congresses, and
80 holds just two bills (both in the 117th), because the pipeline records those transitions
as "Became Law" — so the pages would be empty or near-empty. (Note `lib/hubs.ts` still
says all three are zero, which is no longer exactly true.)

Every hub carries a hand-written plain-language explainer; the rule recorded in
`lib/hubs.ts` is that a hub must be a document, not a filtered list with a new heading. A hub
with zero bills still renders but is marked `noindex`.

**Middleware** (`middleware.ts`, not `proxy.ts` — see [Hosting](#hosting-and-cloudflare-constraints)):
301-redirects `www` to the apex, sends signed-out visitors from `/account` to `/sign-in`,
sends signed-in visitors away from `/sign-in` and `/sign-up`, and sets `Cache-Control` from
the allowlist in `lib/cacheable-routes.ts`.

Caching is an **allowlist, not a denylist**, on purpose: a missing public route is merely
uncached, whereas a personalised route slipping through a denylist gap would put one
visitor's page in a shared cache. Signed-out responses on `/`, `/about`, `/learn`,
`/privacy`, `/pro`, `/terms` and anything under `/bills` get
`public, max-age=0, s-maxage=300, stale-while-revalidate=86400`; any request carrying an
auth cookie gets `private, no-store`. **New public routes must be added to that file.**
A route that writes its own `Cache-Control` is listed in `setsOwnCacheControl` in the same
file, and the middleware leaves it alone — its header would otherwise replace the route's.
The share card is the one such route today.

**Error boundaries.** `app/error.tsx` catches client render failures for a route segment;
`app/global-error.tsx` catches failures in the root layout and renders its own
`<html>`/`<body>` with inline styles, since it replaces the layout. Both recognise a
stale-asset `ChunkLoadError` — a tab opened before a deploy asking for a content-hashed chunk
the new deploy no longer serves — through `lib/chunk-error.ts`, and do one guarded
`location.reload()` to load fresh assets. The guard (a timestamped sessionStorage key) blocks
a second reload inside a short window, so a genuinely broken deploy shows a retry control
instead of looping. Both report the error through `analytics.captureException`, because a
boundary catches the error before PostHog's window-level capture would see it.
`next.config.mjs` sets a per-deploy `deploymentId` (the git commit) so Next.js skew protection
can force a full reload on navigation when a tab is out of date, avoiding the failure up front.

---

## The data pipeline

### Source

Everything comes from the **official Congress.gov API v3** (`https://api.congress.gov/v3`).
No scraping, no second provider. The key is sent in an `X-Api-Key` header, never as a query
string, so it cannot leak into logs or upstream caches.

Eight bill types are pulled: `hr`, `s`, `hjres`, `sjres`, `hconres`, `sconres`, `hres`,
`sres`. Five endpoints per bill, tracked as a bitmask in `bills.syncedEndpoints`:

| Bit | Endpoint | Paginated? |
| ---: | --- | --- |
| 1 | detail | n/a — the only **critical** fetch; the rest are best-effort |
| 2 | actions | Yes — 250 per page, max 8 pages (2,000 actions). It was a single unpaginated page until August 2026, which silently truncated long histories — and stage derivation reads that history |
| 4 | subjects | Yes — 250 per page, max 20 pages |
| 8 | summaries | n/a |
| 16 | text versions | n/a |

`31` means fully synced. The weekly repair job range-scans the `by_syncedEndpoints` index for
values below 31, so a healthy table reads **zero** rows for that job regardless of size.

### The covered window

`currentCongress = floor((year - 1789) / 2) + 1` — computed, never hardcoded. The daily,
weekly and monthly syncs touch **only the current Congress**. Only the Monday reconciliation
reaches back two Congresses, and it only *inserts* bills that are entirely missing. Nothing
re-fetches an already-complete bill in a previous Congress, so an upstream correction to a
117th- or 118th-Congress bill will not be picked up.

### The cron jobs

Nine keep the data in step with Congress; a tenth (the last row) sends bill alerts.

| Job | Schedule (UTC) | Scope | Purpose |
| --- | --- | --- | --- |
| `daily-incremental-sync` | 01:00 daily | Current Congress | Bills changed in the last 26 hours (24h interval + 2h safety) |
| `indexnow-submit-morning` | 01:30 daily | — | Drain the IndexNow queue, 30 min after the sync |
| `weekly-full-sync` | Sun 02:00 | Current Congress | Everything changed in 7 days, as a safety net |
| `weekly-repair-incomplete` | Wed 03:00 | All | Re-fetch only the endpoints a half-synced bill is missing |
| `daily-recompute-stats` | 04:00 daily | All | Rebuild `congressStats` and `congressChamberBreakdowns` |
| `weekly-committee-base-rates` | Fri 04:30 | Finished Congresses | Recompute committee base rates |
| `monthly-current-congress-repull` | 05:00 on the 1st | Current Congress | Full re-fetch with no date filter |
| `weekly-reconcile-recent-congresses` | Mon 06:00 | Current + 2 | Diff the full live list against ours — **the only path that finds never-synced bills in a previous Congress** (the monthly re-pull covers the current one) |
| `indexnow-submit-evening` | 13:30 daily | — | Second queue drain |
| `daily-bill-alert-digests` | 11:00 daily | Followed bills | Email each Pro reader whose followed bills moved (`alerts.runDigests`). Ten hours after the sync |

### Throttling

Tuned against the Congress.gov budget of 20,000 requests/hour: 750 ms between calls, batches
of 50 bills, up to 3 retries with exponential backoff starting at 10 s on a 429, a circuit
breaker after 5 consecutive failures with a 5-minute cooldown, and a live floor that pauses
the batch when the API's remaining-quota header drops below 2,000.

### Progress stage — derived here, not supplied

`convex/billStage.ts` is a **pure module** (no Convex imports) so it can be unit-tested
without a database. It scans a bill's action text, type and Library-of-Congress action codes
into flags, then resolves precedence *after* the whole scan:

```
becameLaw → vetoed → signed → toPresident → passedBoth → passedOne → inCommittee → Introduced
```

| Stage | Label |
| ---: | --- |
| 20 | Introduced |
| 40 | In Committee |
| 60 | Passed One Chamber |
| 80 | Passed Both Chambers |
| 85 | Vetoed |
| 90 | To President |
| 95 | Signed by President |
| 100 | Became Law |

> **The E30000 trap.** The Library of Congress attaches action code `E30000` to **both**
> "Signed by President" and "Vetoed by President". An earlier implementation returned early
> on that code and reported real vetoes as bills signed into law. There is now **no code
> branch on `E30000` at all** — a signing is recognised only by the unambiguous text
> `"signed by president"`, vetoed deliberately outranks signed, and the no-early-return
> structure is what makes that resolution possible. Tests pin both directions.

### Writes are suppressed when nothing changed

`upsertBill` compares every field and returns early if nothing differs. This is not a
micro-optimisation: any real write fires the aggregate triggers and restamps `updatedAt`,
which is the `<lastmod>` the sitemap gives search engines. The monthly re-pull resends every
bill unchanged, so blind patching would announce ~18,000 fake updates a month.

A second, narrower guard decides IndexNow pings: only a change to `progressStage`,
`progressDescription` or `title` counts as reader-visible.

### IndexNow

Bills whose pages changed are announced to Bing, Yandex, Seznam and Naver (Google does not
participate) twice a day, up to 2,000 URLs per run. `queueForIndexNow` is a **plain function,
not a mutation**, so it joins the caller's transaction rather than racing it, and it dedupes
per bill — one sync produces one announcement.

| `reason` | Queued when |
| --- | --- |
| `new` | Bill row created |
| `status` | `progressStage`, `progressDescription` or `title` changed |
| `action` | `latestActionDate` changed |
| `topic` | `policyAreaName` changed |
| `summary` | A summary's text changed, or a new summary arrived |
| `seed` | The one-time backlog walk, at lower priority |

Two priority lanes exist so a real change is never stuck behind the ~55,000-page backlog
seed, which would otherwise delay announcements by about two weeks. A promotion restamps
`queuedAt` so a seed's original timestamp cannot sort ahead of this morning's changes.

The key file published at the domain root is **not a credential** — the protocol requires it
to be publicly retrievable. `lib/indexnow.test.ts` reads all three copies (library constant,
backend constant, served file) and fails if any two disagree.

### Committee base rates

*"Among bills from finished Congresses that were also still in committee this long, what
share ever advanced past committee?"* — a fact about a group of past bills, **never a
prediction about a single bill**, and the bill page says so in those words.

Computed only from Congresses strictly earlier than the current one, bucketed by days already
spent in committee (`[0,90)`, `[90,180)`, `[180,365)`, `[365+)`), and a bucket is hidden
entirely unless backed by at least 100 past bills.

### Query limits, and how truncation is surfaced

| Constant | Value | Effect |
| --- | ---: | --- |
| `MAX_LIST_LIMIT` | 50 | Page size ceiling |
| `MAX_LIST_OFFSET` | 500 | `/bills` stops at page 51; hubs at page 10 |
| `MAX_LIST_SCAN` | 1,200 | The browse loop gives up after scanning 1,200 index rows |
| `SEARCH_LIMIT` | 1,024 | Full-text search caps at 1,024 matching documents |

The browse loop stops at `MAX_LIST_SCAN`, so a filter whose matches are sparse in the
iterated index can run out before the page is filled. Two things keep that honest:

- **Pick the narrowest index available.** `narrowestIndexFor` chooses between the policy-area,
  progress-stage and sponsor-state indexes before iterating. State was the missing one:
  `/bills?state=WY&congress=119` used to walk the whole Congress newest-first and return 2
  rows for a filter the count query correctly reported as 161.
- **Say so when the scan still gives up.** `list` returns `truncated: true` in that case and
  the page prints "partial list — narrow the filters or search by title to reach the rest".
  A short list is a fine answer; a short list presented as the whole set is not.

Filters with no index of their own (bill type, date ranges, sponsor names) can still
truncate — they now say so rather than implying completeness.

Search matches **titles only** (the only search index is `search_title`), plus a separate
exact bill-number lookup path. A query longer than the index allows is trimmed to fit
(degrading into a looser search) rather than throwing. When a search hits the 1,024 ceiling
the count is returned as a floor so the UI can say "at least N" instead of a confident wrong
total.

---

## The database

24 application tables plus 6 installed by `@convex-dev/auth`.

### Bill data

| Table | Purpose |
| --- | --- |
| `bills` | One row per (congress, type, number). Identity, title, primary sponsor, introduced date, derived stage, latest action date, denormalised policy area, sync bitmask |
| `billActions` | Legislative actions, up to 250 per bill. Indexed by bill, and by bill + date for bill alerts |
| `billSubjects` | The single official policy area |
| `billSummaries` | CRS summary versions, keyed by update date |
| `billText` | Links to official PDF and text versions |
| `billLegislativeSubjects` | The long per-bill subject list (HR1/119 has ~239). Stored but not surfaced |
| `billTitles` | **Dead** — never written; the only reference is a delete loop |
| `syncSnapshots` | Audit trail of every sync run |

Two design decisions worth knowing:

- **`bills.policyAreaName` is a denormalised copy** of `billSubjects.policyAreaName`. The
  cross-table intersection it replaced *silently returned 0 of 2,070 real "Health" matches*
  for a Congress, because it matched the oldest 2,000 subject rows against the newest 1,200
  bills. `upsertBillSubject` writes both, or they drift.
- **Only the primary sponsor is stored.** There are no co-sponsors anywhere in the database,
  and the answer engine is explicitly instructed never to imply otherwise.

Not held at all: vote tallies and roll calls, committee hearing schedules, member
biographies or contact details, floor speeches, and the full text of bills (only a link).

### Precomputed analytics

`congressStats`, `congressPolicyAreas`, `congressSponsors`, `congressChamberBreakdowns`,
`committeeBaseRates`. See [interactive-dashboard.md](interactive-dashboard.md) for the full
strategy, the rules for adding one, and the two incidents that produced them.

### Accounts and AI

| Table | Purpose |
| --- | --- |
| `users` | Name, email, image, verification time, plan, and the Stripe mirror: `stripeCustomerId`, `stripeSubscriptionId`, `stripeSubscriptionStatus`, `stripePriceId`, `stripeCurrentPeriodEnd`, `cancelAtPeriodEnd`. `plan` is written **only** by the Stripe webhook (`billing.applySubscription`) and gates the Pro question allowance and bill alerts |
| `savedBills` | One row per (user, bill) bookmark. Free, silent |
| `billAlerts` | One row per (user, bill) a Pro reader follows by email, with the watermark the digest advances: `lastSeenActionDate`, `lastSeenActionFingerprints` (actions on that date), `lastSeenStage`, `lastEmailedAt` |
| `stripeEvents` | Webhook idempotency: one row per Stripe event id, `received` → `processed` / `failed` |
| `chats` / `chatMessages` | Saved answer conversations, frozen with their citations, entities and work log |
| `billChats` / `billChatMessages` | The old per-bill chat. Still written by the dead route |
| `billChatAnalyticsSessions` / `billChatAnalyticsTurns` | Signed-in per-bill chat analytics |
| `indexNowQueue` | Bills whose pages changed and search engines have not been told |
| `usageEvents` | **Dead** — zero references outside `schema.ts` |

> **`chats.userId` is required, not optional, and that is the point.** An anonymous
> conversation cannot be represented in the schema at all, so it cannot be persisted by
> accident. Do not relax this to make some future feature easier.
>
> Be precise about what that does and does not mean: an anonymous transcript lives only in
> the browser's session storage and is **never written to the database** — but it is still
> POSTed as conversation context with every question, so it does reach Convex and the model
> provider in flight. "Never stored", not "never sent".

### Aggregate components

`convex/convex.config.ts` installs two `@convex-dev/aggregate` indexes — `billsByChamber`
(keyed by bill type) and `billsByStage` (keyed by progress stage), both namespaced per
Congress — plus `@convex-dev/rate-limiter`. They exist so exact chamber and stage counts are
O(log n) instead of a table scan.

They are kept in sync by **triggers**: `convex/mutations.ts` imports `internalMutation` from
`./functions` (the trigger-wrapped constructor), not from `./_generated/server`. Using the
wrong import is how an aggregate silently drifts from the table.

---

## Convex functions

133 hand-written functions — 26 public queries, 6 public mutations, 3 public actions, 2 HTTP
actions, 96 internal — plus four more generated by `convexAuth()` in `auth.ts`: `signIn` and
`signOut` (public actions), `isAuthenticated` (public query) and `store` (internal mutation).
137 registered in total.

| File | Role |
| --- | --- |
| `bills.ts` | The public read surface (18 functions: 14 public queries plus 4 internal) |
| `mutations.ts` | Every sync write and rollup writer (30: 19 internal mutations, all trigger-wrapped, plus 6 internal queries and 5 internal actions) |
| `congressApi.ts` | Sync, reconcile, repair, backfill (19) — **every one an `internalAction`** |
| `answer.ts`, `catalog/` | The grounded answer engine |
| `chats.ts`, `savedBills.ts`, `users.ts`, `auth.ts` | Accounts |
| `billing.ts` | Pro: `startCheckout` and `openBillingPortal` (public actions), `status` (public query), the Stripe webhook HTTP action and the internal mutations it calls |
| `alerts.ts`, `email.ts` | Bill alerts: follow/unfollow, the account list, token unsubscribe, the daily digest run; `email.deliver` hands each digest and plan-change email to PostHog |
| `llm.ts` | The old per-bill chat back end. Holds `sendChatMessage`, a public action reached solely by the dead `/api/bill-chat/send` route |
| `indexNow.ts` | Search-engine notification (10, all internal) |
| `rateLimits.ts` | The limiter config, `getChatUsage` (the public query behind the account page's quota meter) and `limitChatQuestion`, the one helper that picks the anonymous, free or Pro bucket |
| `sync.ts`, `aggregateBackfill.ts`, `policyAreaBackfill.ts`, `chatAnalytics.ts` | Operational backfills and diagnostics, almost all internal |
| `crons.ts`, `http.ts`, `convex.config.ts`, `functions.ts` | Schedule, HTTP router, installed components, trigger-wrapped constructors |
| `billStage.ts`, `chamber.ts`, `baseRates.ts`, `searchQuery.ts`, `syncStatus.ts`, `plan.ts`, `alertDigest.ts` | Pure modules, no Convex imports, unit-tested |

### The visibility rule

Almost anything expensive, destructive, or diagnostic is an **internal** function. `npx convex
run` invokes internal functions as admin, so CLI use is unaffected. Reasons recorded in the
code:

- `answer.ask` — *"this path has no rate limiter … a public export would be an unmetered door
  to OpenRouter for anyone holding the deployment URL."*
- `congressApi.triggerRecomputeStats` — *"the cascade paginates every bill in every congress
  and would let any visitor amplify Convex function-quota cost on demand."*
- `congressApi.deleteCongress` — *"destructive and irreversible (the next incremental sync
  only re-pulls the last 26 hours of activity, so historical congresses do NOT
  auto-recover)."*
- `policyAreaBackfill.status` — *"reads several thousand documents per call, which as a public
  query would be unauthenticated read burn."*

`aggregateBackfill.countsByType` and `aggregateBackfill.status` were public until August
2026 — `status` does three `.take(1000)` scans per call, exactly the unauthenticated read
burn cited above. Both are `internalQuery` now; the CLI commands in the runbook are
unaffected because `npx convex run` calls internal functions as admin.

Two automated guards enforce related rules on every `pnpm test` — see
[Build, test and deploy](#build-test-and-deploy).

---

## The answer engine

Replaces the per-bill chat panel, which was removed on 26 August 2026.

### Request flow

```
components/answers/answer-provider.tsx      one provider, mounted in app/layout.tsx
  └─ fetch POST /api/answer            body carries `context` — route enum, congress, billId
       └─ app/api/answer/route.ts           attaches the httpOnly auth cookie and the
            │                                anonymous session cookie, and injects an SSE
            │                                keep-alive comment while the loop runs silent
            │                                so an idle timeout cannot reap a long answer
            └─ POST {CONVEX_SITE_URL}/answer/stream     (convex/http.ts → answer.stream)
                 ├─ rate-limit check  ← the token is consumed BEFORE the model is called
                 ├─ primed, costing no round: describe_dataset for bills + topics, and
                 │    (off bill pages) the topics list for the Congress on screen
                 ├─ tool loop, max 4 rounds (the 5th call goes out WITHOUT tools)
                 │    ├─ describe_dataset
                 │    ├─ fetch_dataset   → convex/catalog/fetch.ts
                 │    ├─ search_web      → OpenRouter web plugin, engine "exa"
                 │    └─ ask_reader      → ends the turn with a question, not an answer
                 ├─ deliberation stripped → convex/catalog/answerSanitize.ts
                 ├─ citation resolution → convex/catalog/cite.ts
                 └─ SSE frames back: work · delta · done · rate_limited · error
                      (the proxy adds `: keep-alive` comments between them)
```

The panel is mounted in the root layout as a **sibling** of the page content, never inside
it, so a conversation survives client-side navigation. Prose is emitted only *after* citations
are resolved, in 60-character chunks — never token by token, because a fabricated citation
must not be visible even briefly.

### The panel

Three shapes, chosen by media query in `app/globals.css` and described by `lib/ask-panel.ts`:

| Viewport | Shape | Behaviour |
| --- | --- | --- |
| `< 1024px` | bottom sheet | Starts below the live header, so the navigation stays usable. Body scroll is locked while open — in CSS, so there is no listener to leak and rotation self-corrects. |
| `1024–1343px` | floating rail | Sits beside the page without pushing it. Squeezing here would starve the layout; see below. |
| `>= 1344px` | docked rail | Pushes `.ask-shell` (the wrapper around header, main and footer) with `padding-right`, and is drag-resizable between 320 and 640px. |

**1344 is derived, not chosen.** `container-editorial` at a 1024px viewport gives its `lg:`
layouts 960px of inner width, so the pushed shell must never fall below 1024px — and the
narrowest useful panel is 320px. Tailwind's media queries see the **viewport**, not a content
box shrinking underneath them, so a starved `lg:` grid cannot notice and adapt. That invariant
is the reason `lib/ask-panel.test.ts` sweeps every docked viewport against every requested
width rather than spot-checking a few.

**The mode is never computed during render.** The panel lives in the root layout, so reading
the viewport while rendering would be a hydration mismatch on every page of the site. CSS owns
the decision. Where JavaScript needs the width it calls `viewportWidth()`, which returns
`documentElement.clientWidth` — *not* `window.innerWidth`, which includes the classic
scrollbar while a `width` media feature does not. The ~15px difference is enough, at a window
sized near the dock threshold, to have JavaScript believing the panel is docked while CSS is
still drawing it over the page.

`app/globals.css` cannot import those constants, so `lib/ask-css-contract.test.ts` reads the
stylesheet as text and asserts the breakpoints, the two `--header-h` values (57/65px — one
header row, `h-14` / `sm:h-16`, plus its border) and the panel's z-index match `lib/ask-panel.ts` and
`components/navigation.tsx`. That drift is guaranteed otherwise, not merely possible.

**The panel is never unmounted** — only translated off-screen and marked `inert`. The phase
machine is `lib/ask-panel-state.ts`: `closed`, `open`, `minimized`. Keeping it mounted is what
makes the next part cheap.

**Stepping aside.** A bill card inside an answer was always a working link, but on a phone the
sheet covered the page it opened, so the tap read as doing nothing. `answer-panel.tsx` captures
the click at the panel boundary and minimises *on the tap*, before the route commits — which
also catches tapping the bill the reader is already on, where no route change ever fires. A
`usePathname` effect backstops navigations that never pass through the panel. Because nothing
unmounts, the thread's scroll position and the composer's draft survive. Focus moves to
`<main>`, so a keyboard or screen-reader user lands on the page they just opened.

`components/answers/ask-launcher.tsx` is the way back, and the way in: present on every page in
every phase but `open`, and **not** gated on a conversation already existing — topic hubs and
`/learn` previously had no ask affordance at all. A corner pill normally; a full-width bottom
bar on a phone when a conversation has been set aside.

### Page context

Each route publishes what it has open via `components/answers/ask-page-context.tsx`, a
null-rendering component. `lib/page-context.ts` turns that plus the path into the payload;
`convex/catalog/context.ts` validates it again on arrival and composes the prompt block.

The wire carries **identifiers and enums only** — a route name from a closed set of six, an
integer Congress bounded 1–200, and a bill id matched against a pattern. It never carries
prose, and the one client string that does reach the model (the scope label, which is partly
reader-typed via the title filter) is newline-stripped and clamped to 120 characters first.
`/answer/stream` is an httpAction on `*.convex.site` and is publicly addressable, so
`app/api/answer/route.ts` is defence in depth and `convex/catalog/context.ts` is the boundary.

Context says **where to look**, never what is true. Prose injected into a prompt carries no
`_cite` handle, so `cite.ts` deletes any citation hung on it and the reader is left with an
unsupported sentence. The bill on screen is therefore **seeded as a tool result**, carrying its
handle, exactly as a pre-applied scope is — specific answers that still cite a real record.

> `surfaceFor` used to treat any single segment under `/bills/` as a bill id, so the seven hub
> routes reported `surface: "bill"` on every answer event and the prompt asserted *"the reader
> is looking at bill enacted"*. It now lives in `lib/page-context.ts` with tests.

### Grounding

The model never writes a query. It names one of **six datasets** — `bills`, `bill_actions`,
`bill_summaries`, `topics`, `sponsors`, `stats` — and passes filters to whitelisted
server-side handlers that choose the index, ordering and caps. A unit test asserts the list
is exactly those six.

| Limit | Value |
| --- | ---: |
| Tool rounds | 4. The fifth call goes out with the tool schema **withheld**, so the model has to write prose; the answer is flagged `partial`. `bills` and `topics` are described before the question (`PRIMED_DATASETS` in `convex/catalog/tools.ts`), and off bill pages the topics list is fetched too, because traces of real questions showed those two exchanges using the first two of the four rounds |
| Rows per fetch | 20 default, 50 max. `limit: 0` is count-only — no rows, a deeper scan, an exact total |
| Scan window | 1,000 rows (8,000 for a count-only read). When it fills, the result is `complete: false` and carries **no total at all** |
| Sponsor lookups per request | 10 distinct surnames |
| Question length | 2,000 characters |
| History sent back to the model | 10 turns / 8,000 characters, oldest dropped first |
| Answer tokens | 2,048, temperature 0.3, model reasoning disabled |

**Provenance handles.** Every row handed to the model carries a `_cite` handle such as
`bills:1234hr119`. The model is told to cite handles and forbidden from ever writing a URL.
After the answer is written, every cited handle is checked against the exact set of rows it
was given *that turn*; anything else is deleted from the text. Invented bill cards likewise
do not render. The count of deletions is the `dropped` metric — the grounding-health number.

This filters **citations and entity directives, not prose**. The sentences around them are
never verified. A rising `dropped` means the catalog's `gotchas` need strengthening; that is
the fix, not a prompt patch elsewhere.

### The truth harness — how we know

`scripts/truth/` is the standing check that the answer engine is telling the truth. It exists
because 41 confirmed defects shipped without anyone noticing, and every one of them produced a
confident, cited, wrong sentence.

| File | Role |
| --- | --- |
| `dump.ts` | Copies the raw legislative tables out of production into `.truth-cache/` (gitignored). Read-only; keeps only public tables and deletes the rest of the export immediately |
| `fakedb.ts` | A stand-in for `ctx.db` over that copy. Parses the index definitions straight out of `convex/schema.ts`, so it cannot drift, and throws on an index that does not exist |
| `handlers.test.ts` | Runs the **real** fetch handlers against the **real** data, locally, with no deployment. This is where the accuracy fixes are actually proven |
| `questions.ts` / `check-answers.ts` | Ask production a fixed set of factual questions and score each answer against truth computed from raw rows |
| `extract.ts` | Pulls a checkable claim out of an answer's prose. Deliberately strict — it refuses rather than guesses, because a lenient extractor scores a wrong answer as a pass |

Two rules make this worth having. **The oracle shares no code with the system under test** — a
harness built on `fetchDataset` would agree with every bug in `fetchDataset`. And
`fakedb.test.ts` asserts that the stand-in reproduces production's *known wrong answers* before
it is trusted to prove any fix; if that file goes red, nothing depending on it can be believed.
Where an expected value is a count or a bill that changes as Congress acts, both files compute it
from the raw rows by a hand-written loop (the index order Convex would return, the law
with the latest action date), so a fresh copy of production is checked against itself, not against
the numbers of the day the test was written.

`handlers.test.ts` and `fakedb.test.ts` run in `pnpm test` when `.truth-cache/` exists and are
reported as **SKIPPED** when it does not — separately from the pass count, with a list of what
did not run. That distinction matters: the accuracy assertions skipped silently in CI for a
while, and `pnpm test` printed "0 failed", so a green check read as proof of the one thing it had
not checked. `REQUIRE_TRUTH_CACHE=1 pnpm test` turns those skips into failures and is the gate to
run before merging anything under `convex/catalog/`.

Wiring CI to run them would mean either committing a copy of the production tables or giving the
workflow a Convex key — both are decisions worth making deliberately, and a PR that edits its own
review workflow forfeits that review. Until then the gate is local and the skip is loud.

`check-answers.ts` costs real model calls against production and is run deliberately, never in CI.

**When a wrong answer turns up in the wild, add it to `questions.ts` first, watch it go red, then
fix it.** That file is the institutional memory of every way this system has stated something
untrue.

### The completeness contract

This is the load-bearing idea of the whole answer engine, and it exists because of what happened
without it. Every result from `fetch_dataset` now declares three things, built by
`convex/catalog/completeness.ts`:

| Field | Meaning |
| --- | --- |
| `set` | Plain-English description of the set the rows were drawn from, e.g. *"every measure in the 119th Congress with policy area 'Health', terminal stage 100"* |
| `complete` | Whether every row matching the filters was examined |
| `total` | The size of that set. **Present only when `complete` is true** |
| `order` | `arbitrary` unless an index or a complete in-memory set guarantees a sort |

The model is told, in the system prompt, that a **set-level claim** — a count, a total, "most",
"fewest", "newest", "the only", "none", an average, any ranking — may be made ONLY from a result
with `complete: true`. Everything else is a sample.

**Why the absence of `total` matters more than any warning beside it.** The previous shape was
`{ truncated, count, countIsLowerBound }`, where `count` was whatever survived an in-memory
filter over a capped window. A capped scan that matched nothing returned `total_matching: 0`
with `total_is_at_least: true`, and "at least 0" beside an empty row list read as *"none exist"*.
That single shape produced, in production:

- *"104 House bills became law"* — that is both chambers; the House figure is 64. The model
  printed the party split in the next sentence, which sums to 64, without noticing.
- *"Tom McClintock has introduced the fewest bills in California"* — 25 of California's 54
  members were invisible; the real answer is James Gallagher with 5. The model justified itself
  with *"truncated: false … meaning all matching rows were returned"*.
- *"We don't have data on Texas bills that became law"* — eleven had, including H.R. 1.

So a result that cannot defend a number now carries **no number**. There is nothing to reach for.

**Ordering is never implied.** `order: "arbitrary"` means index order, which after an `eq()`
prefix is insertion order. Asked for the most recent law, the model previously read the maximum
date off an arbitrary page and named S. 1003 (26 June); the real answer, S. 629 (12 July), was
not on the page at all. A sort is honoured when an index provides it or when the whole set was
read; over an incomplete set the sort is refused and the order stays `arbitrary`.

**Breakdowns are one fetch, not thirty.** `groupBy` on `bills` returns one row per category with
its own count — `{congress, progressStage: 100, groupBy: "policyArea"}` answers "how many of the
laws passed were in each category" in a single call. Before it existed that question needed one
fetch per policy area, ran out of tool rounds, and shipped the model's own working-out to the
reader as the answer.

**Terminal stage vs milestone.** `progressStage` is where a measure STOPPED — the buckets are
mutually exclusive, so the "passed one chamber" bucket excludes everything that later became law.
Use `reachedStage` for "got at least this far". Counting the terminal bucket answered *"how many
bills has the Senate passed"* with a number that omitted all 104 laws.

**Measures, not bills.** Totals count every measure, including ~2,500 simple and concurrent
resolutions a Congress, which are not bills and can never become law. Bill rows carry
`measureType` and `canBecomeLaw` so an answer can use the right word.

**Time.** The system prompt now carries today's date and, for a Congress that has adjourned, an
instruction to use the past tense. Two of the three Congresses we hold are over — about 37,000 of
~55,000 rows — and without this the model described them as still in progress. `stats` carries
`dataLastSynced` so "how current is this?" has a real answer instead of an invented one.

**Asking instead of guessing.** A fourth tool, `ask_reader`, ends the turn with one question when
the reader's question has two readings that give materially different numbers. "How many bills has
the Senate passed" is the canonical case, and it silently changes the answer by a factor of two.

**Bad filters return a descriptive error, never an empty result** — because an empty result
reads as "none exist" and would turn a typo into a confident falsehood.

### Web search

Permitted only after a fetch returned nothing, or when the question is about something a
dataset's `NOT IN THIS DATASET` list names. The model must supply a one-sentence `reason`
naming the gap; an empty reason is rejected and the search does not run. That sentence is
shown to the reader verbatim, and sources render in two blocks — *From our database* and
*Not from our database* (external links carry `rel="nofollow"`).

`lib/search-query-guard.ts` rejects any search string containing first-person words, or that
repeats the reader's question verbatim or at more than 80% of its length. A rejection is
recoverable: the model rephrases and retries.

> Nothing limits the model to **one** web search — `search_web` is available in every tool
> round. Two searches in one turn collide: handles are re-minted `web:1…web:5` and `webReason`
> is overwritten by the last call, so the sentence shown may not match the sources listed.

### Persistence

| Signed out | Signed in |
| --- | --- |
| Nothing is written server-side. The transcript lives in `sessionStorage` under `bic_answer_transcript`, capped at 10 turns / 8,000 characters, and dies with the tab. | Saved to `chats` / `chatMessages` with citations, allowed handles, entities, web reason, web sources and the work log, so reopening re-renders exactly as given even after the bill's status changes. |

Signing in mid-conversation offers **once** to keep the transcript (capped at the last 20
turns). It is never applied silently. Saved conversations are readable only by their owner;
"not yours" and "does not exist" both return `null` so ids cannot be enumerated into a map of
who uses the product. Nothing expires them — no cron touches the chat tables.

### Model configuration

| Setting | Default | Override |
| --- | --- | --- |
| Model | `deepseek/deepseek-v4-flash-0731` — a **dated release**, not a floating alias, because an alias can resolve to a version no allowlisted provider carries yet, turning a model release into an outage | `OPENROUTER_MODEL` |
| Providers | `deepinfra,amazon-bedrock`, sent as `provider.only` | `OPENROUTER_PROVIDERS` (blank falls back to the default) |
| Fallbacks | `deepseek/deepseek-v4-flash`, then `amazon/nova-lite-v1` | `OPENROUTER_FALLBACK_MODELS` — **blank DISABLES failover** (`??`, not `||`) |
| Retention | `data_collection: "deny"` and `zdr: true` on every request | — |
| Price ceiling | `$0.20 / $0.40` per million prompt/completion tokens | — |

> **The 404 trap.** Two allowlists must overlap: the per-request `provider.only` above, and
> the allowed-providers setting on the **OpenRouter account itself**. If they do not overlap,
> OpenRouter returns 404 for every request rather than falling back to anything. A previously
> shipped default (`coreweave,gmicloud`, neither permitted on the account) took production
> chat down until it was corrected. Check this first if chat 404s after a deploy.
>
> Note also that the provider pin names **companies, not regions** — a base slug matches all
> that provider's endpoints including regional variants. It is an allowlist chosen for US
> processing, not a hard geographic guarantee; OpenRouter's true region-locking is
> enterprise-only.

### Rate limits

5 questions/day signed out, 100/day signed in, 500/day on Pro (constants in `convex/plan.ts`;
the UI imports the same ones). Pro is a separate bucket, `chatProPerDay`, not a bigger rate
on the free one, so upgrading mid-day starts a fresh Pro allowance. Which bucket applies is
decided only in `limitChatQuestion` (`convex/rateLimits.ts`), from the stored `users.plan`.
Fixed windows (all tokens granted at window start, no carry-over) aligned to midnight US
Eastern. The signed-out limit is keyed to an
httpOnly, SameSite=Lax cookie `bic_bill_chat_session` holding a random UUID, 60-day lifetime.
OTP emails are separately limited to 5 per hour per address.

**The daily token is consumed before the model is called** — a mid-flight failure costs the
user that question. The rate limiter is the only spend cap on this path.

### Guardrails

| Script | Runs | Enforces |
| --- | --- | --- |
| `scripts/check-no-userid-args.ts` | `pnpm test` | No **public** Convex function accepts a `userId` argument — identity must come from `getAuthUserId(ctx)` |
| `scripts/check-metered-model-calls.ts` | `pnpm test` | In any module reading `OPENROUTER_API_KEY`, every public `action`/`httpAction` calls `rateLimiter.limit` or `limitChatQuestion` |
| `pnpm check:retention` | Manual, needs a key | Whether the retention flags still leave any provider able to serve, for the primary **and every fallback** |
| `pnpm check:web-citations` | Manual, needs a key | Whether the web plugin still returns the `url_citation` annotations the code parses |
| `pnpm check:grounding` | Manual, needs a key | End-to-end: drives the real prompt, tools and resolver against the live model with fixtures, and fails if the model invents a co-sponsor count, cites nothing real, leaks a raw marker, or reaches for the web when our own data answers |

Re-run the three manual probes whenever the model or provider pin changes.

---

## Accounts and auth

`@convex-dev/auth` with two providers: **Google OAuth**, and **email + password** with a
6-digit code emailed through PostHog Workflows (see "Email" below) that expires in 15 minutes. Passwords must be ≥10 characters
with upper case, lower case and a digit, enforced server-side; they are stored only as a
scrypt hash by the library.

Sessions last **60 days** (both total and inactive), and the cookie `maxAge` in
`middleware.ts` must stay ≥ that value.

A free account gets you three things: bookmarking bills (the account page lists the most
recent 200), saved conversation history, and the higher daily question allowance. Pro, the
one paid plan, adds bill alerts and a higher allowance still — see the next section.

Deliberate hardening worth preserving:

- Sign-in failures are vague — wrong email and wrong password produce the identical message,
  so the form cannot enumerate registered addresses. Sign-up phrases its confirmation as
  "If this email can be used…" and advances to the verify step even on some errors, for the
  same reason.
- Post-sign-in redirects are restricted to an allowlist (`billsincongress.com`, `www`,
  same-origin paths, plus `localhost:3000` / `127.0.0.1:3000` for local development).
- No public function takes a `userId` — enforced by a guard on every test run.

**Not built (UI only):** the password-reset *back end* is wired — `convex/auth.ts` passes
`reset: PasswordResetCode` (`convex/emailCodes.ts`), which emails a 6-digit reset code on the same rate-limit
bucket — but no page ever starts the flow, so `/forgot-password` is a static "coming soon"
page asking people to email. Self-serve account deletion does not exist at all; deletion is
handled by emailing `hi@billsincongress.com`. The Privacy Policy says so plainly.

---

## Email

Every email goes out through **PostHog Workflows** from `no-reply@mail.billsincongress.com`.
Three workflows, one per kind of email, all sharing that sender and one webhook secret: **sign-in
codes** (sign-up codes today; the password-reset code is wired and rendered the same way, but
nothing sends it until a page starts the reset flow — see "Not built" above), **bill alerts** (Pro digests; see "How alerts
work") and **billing** (Pro plan changes; see "What the reader sees, state by state"). The
bullets below describe the sign-in codes; alerts and billing work the same way except where
those sections say otherwise.

- **The site writes the email; PostHog only delivers it.** `convex/codeEmail.ts` renders the
  subject, plain text and HTML (letterhead in `convex/emailStyle.ts`), and
  `convex/posthogEmail.ts` POSTs them to the workflow's webhook. The workflow is one email
  step that places those fields with Liquid's `| raw` filter (without it PostHog
  HTML-escapes them). To change the wording, edit the code, not the workflow.
- **The webhook needs a password.** Its trigger requires `Authorization: Bearer
  <POSTHOG_EMAIL_WEBHOOK_SECRET>` and rejects anything else with a 401, so the URL alone
  cannot be used to send mail as the site.
- **Sent inline, not queued.** The code is posted from the sign-in request itself, so a
  failure reaches the reader as "Could not send verification email." at once.
- **Transactional, untracked.** The step's message category is transactional (sent even to
  someone who opted out of other mail, no unsubscribe header) and open/click tracking is
  off: no pixel, no rewritten links.
- **Works with remote content blocked.** No images, web fonts or remote CSS; the code is
  text. `convex/codeEmail.test.ts` checks this.
- **Sending allowance.** PostHog caps each project's daily sends while it builds a sending
  reputation (a new project starts at 100 a day). Above the cap, emails wait rather than
  fail, which for a sign-up code means a late code. See
  [Sending reputation](https://posthog.com/docs/workflows/sending-reputation).
- **DNS** (Cloudflare, added by PostHog's one-click Domain Connect): DKIM and the
  `_amazonses` verification record on `mail.billsincongress.com`, and the bounce domain
  `feedback.mail.billsincongress.com` (MX + SPF). PostHog sends through Amazon SES.
- **What PostHog keeps.** The request is not ingested as an analytics event (the workflow has
  no "Capture event" step), but each run's trigger payload is stored in the workflow's
  Invocations tab: recipient, subject, text and HTML, so **the code itself**. Anyone with
  access to the PostHog project, including AI agents working through `posthog-cli` or the
  PostHog MCP, can read a code there while it is valid (15 minutes, single use, 5 requests an
  hour per address). This was already true of Resend, whose dashboard keeps every sent email's
  body; it is a property of handing the email to any sending service. Keep PostHog project
  membership as tight as Convex's.
- **Bounces and delivery** show up as `$workflows_email_*` events in PostHog (see
  `ANALYTICS.md`) and in the workflow's Metrics tab; per-send step traces are in its Logs tab,
  and each send's full payload in its Invocations tab (above).
## Pro: billing and bill alerts

### How a reader becomes Pro

1. `/pro` → `billing.startCheckout({interval})`. The action creates (once, idempotency key
   `bic-customer-<userId>`) a Stripe customer tagged `metadata.app = "billsincongress"`,
   links it on `users.stripeCustomerId`, and returns a hosted Checkout URL. The subscription is
   tagged with the same `app` and the reader's `userId`.
   **No double billing:** Stripe Checkout will sell a customer the same subscription twice,
   and `users.plan` lags payment by the seconds the webhook takes. So before creating a
   session the action asks Stripe (not our row): a live subscription tagged for this site
   refuses the request (`ALREADY_PRO`; `SUBSCRIPTION_NEEDS_ATTENTION` when it is unpaid or
   paused, which the billing portal fixes; `PAYMENT_PENDING` while a first payment is
   incomplete). After creating the new Checkout page it closes every OLDER open one for this
   site, so however many tabs race, exactly the newest stays payable (three simultaneous calls
   against the sandbox: one open, two expired). If two payments still land, the webhook logs
   `DUPLICATE_SUBSCRIPTION …`; cancel and refund one in Stripe.
   The customer is created without an idempotency key of our own (a key made Stripe replay a
   customer deleted minutes earlier); racing calls each create one, the first link wins, and the
   loser deletes its empty customer.
2. Stripe calls `POST https://<deployment>.convex.site/stripe/webhook`.
   `billing.handleStripeWebhook` verifies the signature, records the event id in
   `stripeEvents` (a redelivery is acknowledged and skipped), then **re-reads the subscription
   from Stripe** rather than trusting the event body, because events arrive out of order.
3. `billing.applySubscription` writes the plan: `active`, `trialing` and `past_due` are Pro
   (`past_due` keeps Pro while Stripe retries the card); everything else is free. An old
   subscription ending cannot downgrade a reader who is on a newer one.
4. The success URL (`/account?checkout=success`) only waits for that write; the account page
   updates live when it lands. Visiting it by hand grants nothing.

"Manage billing" on `/account` opens the Stripe customer portal (`billing.openBillingPortal`)
for card changes, switching monthly/yearly, cancelling, undoing a cancellation, and invoice
history. `startCheckout` and `openBillingPortal` share a rate limit of 20 an hour per reader
(`billingActionPerUser`): each makes several Stripe calls, and Stripe's API rate limit is shared
with the webhook's re-reads.

### What the reader sees, state by state

`planCardView` (`lib/pro.ts`, tested in `lib/pro.test.ts`) decides the plan card on `/account`
for every subscription state, and `billingNotice` (`convex/plan.ts`) decides which email a change
sends. The emails are rendered in `convex/billingEmail.ts` and go out through the "Bills.Congress:
billing" PostHog workflow (transactional, untracked), queued by `applySubscription` in the same
transaction that records the new plan, so a redelivered or out-of-order webhook that changes
nothing sends nothing.

| State (Stripe status) | Plan | Account page says | Buttons | Our email on entering it |
| --- | --- | --- | --- | --- |
| Never subscribed | Free | The pitch | See Pro | — |
| Back from Checkout, webhook not in yet | Free | "Payment received — confirming…"; after a minute, a plain warning with the support address | none | — |
| `active` | Pro | "Renews <date>." | Manage billing | Welcome (or "Welcome back" after an earlier subscription) |
| `active`, cancel at period end | Pro | "Cancelled. You keep Pro until <date>…; renew under Manage billing" | Manage billing | "Your Pro plan ends on <date>" |
| cancellation undone | Pro | "Renews <date>." | Manage billing | "Your Pro plan will keep renewing" |
| `past_due` (renewal failed, Stripe retrying) | Pro | Warning: update your card | Manage billing | "Your Pro payment didn't go through" (once, not per retry) |
| `canceled` | Free | "Your Pro plan has ended. The bills you follow are still saved…" | Manage billing (invoices), Subscribe again | "Your Pro plan has ended" (or "…: payment didn't go through" when it followed `past_due`) |
| `unpaid` | Free | Warning: update your card to restore Pro | Manage billing | "…has ended: payment didn't go through" |
| `paused` | Free | "Pro is paused. Resume it under Manage billing." | Manage billing | "Your Pro plan is paused" |
| `incomplete` (first payment processing) | Free | "Still being confirmed…" | Manage billing | — |
| `incomplete_expired` | Free | "Your last checkout didn't finish… you weren't charged" | Subscribe again | — (it failed in front of the reader) |

`/account?checkout=success` (Stripe's return link) is read once and then removed from the address
bar, so the card says "confirming" until the webhook lands — also for a returning subscriber whose
old subscription had ended — and a reload or bookmark cannot repeat it. The page updates live when
the plan is recorded.

**The welcome.** The moment the page sees the plan turn Pro after that return (the moment
`pro_activated` fires) it celebrates once: three seconds of confetti in the six topic colours
(one canvas, no dependency, nothing under reduced motion) and a "Welcome to Pro" dialog with the
reader's avatar in the Pro ring and two next steps, follow a bill or ask a question. Both files
(`components/pro/welcome-to-pro.tsx`, `confetti.tsx`) are loaded only then. The success URL alone
never celebrates, and because the parameter is gone from the address a reload does not either.
From then on the Pro mark (brand.md, "Pro") shows the plan: the spectrum ring around the avatar in
the header and on `/account`, and a Pro pill in the account menu.

On a bill page the follow button reads **"Email me updates"**, **"Emailing you updates"** (Pro,
following) or **"Updates paused"** (following, but Pro has ended; a click unfollows).

**Stripe sends the money emails, we send the plan emails.** In the Stripe dashboard (live, and
the sandbox for testing) turn on, under Settings → Business → Customer emails, **Successful
payments** and **Refunds**, and under Settings → Billing → Subscriptions and emails, **Send
emails about expiring cards**. Leave **Send emails when card payments fail** off: our
"payment didn't go through" email covers it, and both would mean two emails for one failure.
Stripe does not email a cancellation or a start of service, which is why those are ours.

**Operating notes** (each checked against the sandbox):

- **A refund does not end Pro.** Refunding a payment leaves the subscription active in Stripe, so
  the reader keeps Pro. To take Pro away, cancel the subscription too.
- **To give someone Pro for free**, create the subscription in Stripe with metadata
  `app = billsincongress` and `userId = <their users _id>` (a 100%-off coupon makes it free).
  A subscription without that tag is ignored, by design.
- **Don't use "pause payment collection"** on a subscription: it keeps the status `active`, so
  the reader keeps Pro while paying nothing. Cancel instead.
- **A subscription whose `userId` matches no account** (the account was deleted) changes nothing
  and logs `Stripe subscription … matches no user`; cancel it in Stripe.

**A customer deleted in the Stripe dashboard** (for example on an account-deletion request)
arrives as `customer.deleted`; the webhook drops the link (`_forgetCustomer`) so "Manage
billing" does not open a portal for a customer that no longer exists and a later Subscribe
creates a new one. Stripe does not promise order: an ending subscription processed after
`customer.deleted` does not re-link the customer (only a Pro-granting subscription links one).
If the webhook is missed entirely, `startCheckout` and `openBillingPortal` both check the
customer still exists and drop a dead link themselves. To delete a reader's account: cancel their subscription in Stripe (or delete
the Stripe customer), then delete the account rows.

**Stripe account: OffGrid LLC** (`acct_1UJKPkCylyXxQEhV`, in the BillsInCongress Stripe
organization). Live objects created 24 Sep 2026:

| Object | Id |
| --- | --- |
| Product "Bills.Congress Pro" (statement descriptor `BILLS.CONGRESS PRO`) | `prod_VJzZRmXYFrvxUJ` |
| $9 / month, lookup key `bic_pro_monthly` | `price_1UJLafCylyXxQEhVnVLQfDAr` |
| $90 / year, lookup key `bic_pro_yearly` | `price_1UJLaiCylyXxQEhVKHM2qBOx` |
| Customer portal (default configuration; cancel at period end, switch monthly/yearly, card and invoice history) | `bpc_1UJLayCylyXxQEhVgXocv8a9` |

OffGrid may sell other products from the same account, so everything this site creates is
tagged `app: billsincongress` and the webhook ignores any subscription without that tag. Do not
look customers up by email: a customer of another product with the same address is not the
same billing relationship.

**Sandbox: "BillsInCongress sandbox"** (`acct_1UJKPqEGs4LR10Cz`), a mirror for testing with
test cards:

| Object | Id |
| --- | --- |
| Product "Bills.Congress Pro" | `prod_VJzeUBTaHapQOm` |
| $9 / month, `bic_pro_monthly` | `price_1UJLfPEGs4LR10CzBQpz8c0b` |
| $90 / year, `bic_pro_yearly` | `price_1UJLfREGs4LR10CzYflxinhl` |
| Customer portal (default) | `bpc_1UJLfaEGs4LR10CzowgZUaBD` |

Checked against the sandbox on 24 Sep 2026, end to end through a local backend (the site, the
webhook handler re-reading real sandbox subscriptions, and the emails): Checkout opens with the
reader's email and the right price; a paid subscription records Pro; the portal's cancel (which
sets `cancel_at`, not `cancel_at_period_end`) and its undo both land with the right email; a
monthly → yearly switch records the new interval and sends nothing; an immediate cancel ends Pro
once, and a redelivered event sends nothing more; a second `startCheckout` expires the first
open Checkout page; a forged signature is a 400.

What that run changed:

- **Portal plan switches restart the billing date** (`subscription_update.billing_cycle_anchor:
  "now"`, both accounts). With `"unchanged"`, switching monthly → yearly under Stripe's
  flexible billing mode quoted **$171 due today** instead of $81 ($90 less the unused month).
- **A stored customer that no longer exists is replaced** (`customerExists` in `billing.ts`):
  a reader whose Stripe customer was deleted with the webhook missed, or created on the other
  Stripe account, got "No such customer" on Subscribe instead of a checkout page.
- **Billing dates show in US Eastern time** on the account page and in the emails. Stripe's
  own pages use the Stripe account's timezone, so set **Settings → Business → Account details →
  Time zone** to Eastern on both accounts; otherwise Stripe says a renewal is the 25th while we
  say the 24th (a renewal at 00:58 UTC is 8:58 PM Eastern the day before).

Also worth knowing: Checkout offers Stripe's dynamic payment methods (card, Link, Klarna, Cash
App Pay, Amazon Pay here). A slower method can leave a subscription `incomplete` for a while;
the account page and `refuseSecondSubscription` handle that. The portal lets a reader change the
email Stripe bills to; receipts follow that address, our emails follow the account's.

### How alerts work

`Email me updates` on a bill page (`components/bills/bill-alert-button.tsx`) calls
`alerts.toggle`. Following needs Pro and an email address, and is capped at 100 bills;
unfollowing always works, even after Pro lapses. A new alert's watermark starts at the bill's
current state, so the first email reports only what happens next.

Every day at 11:00 UTC `alerts.runDigests` pages through `billAlerts` and schedules one
`alerts.sendDigestForUser` per reader. That mutation:

- skips readers no longer on Pro. Their list and watermarks are kept as they were, so on
  resubscribing the first digest catches them up on everything that moved while Pro was off
  (still at most 8 actions per bill, with "and N earlier new actions on the bill page"), and
  later digests go back to one day's news;
- reads a followed bill's actions only when `bills.latestActionDate` is on or after the
  watermark, or its stage changed;
- decides what is new with `newActionsSince` (`convex/alertDigest.ts`): later-dated actions,
  plus same-day actions whose fingerprint the watermark has not seen. Actions are re-inserted
  on every sync (`upsertBillActions` deletes and rewrites them), so `_creationTime` is useless
  here; the fingerprint is `date + whitespace-collapsed text`, which also collapses the
  duplicate House/LoC listing of one floor action;
- schedules at most one email (`email.deliver`) and advances the watermarks **in the same
  transaction**: a scheduled function exists only if its transaction commits, so a bill is
  never reported twice and never marked reported without an email queued. `deliver`
  renders nothing; it POSTs the finished digest to the "Bills.Congress: bill alerts" workflow
  (see [Email](#email)) and retries twice, 1 and 10 minutes later, only when PostHog is
  unreachable or answers 429/5xx. A timeout after PostHog accepted could in principle send one
  digest twice; that is preferred over dropping it.

**A heavy day stays one readable email.** Bills are listed status changes first, then by number
of new actions. Up to 12 are shown in full (up to 8 actions each); every other changed bill gets
one line (title shortened to 110 characters) with its link under "Also moved". If the HTML would pass 80 KB, fewer are shown in full.
Gmail clips a message over ~102 KB (hiding the unsubscribe link) and PostHog refuses a request over
500 KB; 100 bills with 10 actions each measured 432 KB before this cap and 79 KB after.

Two ways to stop alerts, and they are not the same:

- **The footer link** ("Stop all bill alert emails") goes to `/alerts/unsubscribe?token=…`, a
  page with a button that posts to `/api/alerts/unsubscribe`. The token is
  `<userId>.<HMAC-SHA256>` under `ALERTS_UNSUBSCRIBE_SECRET` — no table, unforgeable, and
  rotating the secret voids every link. It deletes all of the reader's `billAlerts` rows.
- **The mail client's own unsubscribe button.** PostHog cannot set custom headers, so the
  `List-Unsubscribe` header is PostHog's: the alerts workflow sends as a *marketing* message,
  and a one-click unsubscribe puts the address on PostHog's opt-out list. PostHog then skips
  every later alert to it. Our `billAlerts` rows are **not** touched, so the account page still
  lists the bills; the reader simply stops getting mail. Re-following does not lift a PostHog
  opt-out — remove it under Workflows → Opt-outs.

Digests and sign-in codes share one PostHog sending allowance (a new project starts at 50 an
hour and 100 a day; see [Email](#email)). Emails over the cap wait, so a large digest run can
delay a sign-up code. Ask PostHog support for a higher tier before the list of Pro readers
grows past a few dozen.

### Setting it up (per deployment)

1. Stripe: the Pro product and its two prices exist on OffGrid LLC (table above). Set their
   ids as `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY`.
2. Stripe: add a webhook endpoint `https://<deployment>.convex.site/stripe/webhook` for
   `checkout.session.completed`, `customer.subscription.created`, `.updated`, `.deleted`,
   `.paused`, `.resumed` and `customer.deleted`; set its signing secret as
   `STRIPE_WEBHOOK_SECRET`. Turn on the customer emails listed above.
3. Stripe: the customer portal is configured (table above) and is the account default, so
   `STRIPE_PORTAL_CONFIGURATION` can stay unset.
4. PostHog: the "Bills.Congress: bill alerts" workflow exists (same sender and webhook secret as
   the sign-in codes; see [Email](#email)). Enable it and set its webhook URL as
   `POSTHOG_EMAIL_ALERTS_WEBHOOK_URL`. Generate `ALERTS_UNSUBSCRIBE_SECRET` (any long random
   string).
5. PostHog: enable the "Bills.Congress: billing" workflow and set its webhook URL as
   `POSTHOG_EMAIL_BILLING_WEBHOOK_URL`. Plan-change emails are not gated by the next step: they
   fire only on a real Stripe event for that deployment's own Stripe account.
6. Set `ALERT_EMAILS_LIVE=true` **only on production**. Without it `email.deliver` logs and
   skips every alert send, so a dev deployment holding copies of real users can never mail them.

### Operations

```bash
npx convex run --prod alerts:runDigests '{}'                   # run today's digests now (idempotent per day)
npx convex run --prod alerts:sendDigestForUser '{"userId":"…"}'
npx convex run --prod billing:applySubscription '{…}'          # repair one plan by hand
```

Delivery status (sent, bounced, spam complaint) is in the alerts workflow's Metrics tab and as
`$workflows_email_*` events; failed hand-offs to PostHog are in the Convex logs for
`email:deliver`. Webhook history is in `stripeEvents`; a `failed` row is retried by
Stripe automatically.

---

## Sharing and the installed app

### The Share button

Every bill page has a **Share** button opposite "All bills"
(`components/bills/share-bill-button.tsx`). On a touch-first device with a system share sheet
it opens that sheet (`navigator.share`: Messages, WhatsApp, Mail, AirDrop, Copy); everywhere
else it copies the link and the button reads "Link copied" for a moment, announced to screen
readers too. Desktop Safari and Chrome also implement `navigator.share`, but a desktop reader
pressing Share expects a link on the clipboard, so the sheet is kept for `(pointer: coarse)`.
Where the Clipboard API is missing or refuses, a hidden textarea and `execCommand('copy')` are
tried before the button says "Copy failed".

The link is always `billShareUrl()` in `lib/seo.ts` — the canonical
`https://billsincongress.com/bills/<billId>` — never `location.href`, so a reader who arrived
with a query string or a hash does not pass it on. In the installed app there is no address
bar, so this button is the only way to get a bill's link out. Every press is recorded as
`bill_share_clicked` with the method and whether the link went out; the share sheet does not
tell a page which app was chosen, so nothing records where it went.

### Link previews: the share card

A link pasted into iMessage, WhatsApp, Slack, Discord, LinkedIn, X or an email client unfurls
into the bill's own **share card**: the lockup, the identifier and Congress, the policy area,
the title, the status panel (stage glyph, stage, "Stage n of 7", the seven-step track) and the
sponsor and introduction date. It is drawn on request by
`app/bills/[id]/share-image/route.tsx` from `lib/og/bill-share-card.tsx`, with `next/og`
(satori and resvg), from the bill as it stands at that moment. The design rules are in
`Documentation/brand.md`, "Share card".

- **Tags.** `generateMetadata` in `app/bills/[id]/page.tsx` names the card for both
  `openGraph.images` and `twitter.images`, with width, height, type and alt text. The page's
  title and description tags were already specific to each bill. Messaging apps read these from
  the `<head>`, which is why the bill page must not gain a Suspense boundary that streams
  metadata into the body (the comment on the page records the other reasons).
- **Freshness.** The card states a status, and a status is exactly what goes stale. Its URL
  carries the stage and a design version, `?v=<SHARE_CARD_VERSION>.<stage>`
  (`billShareImagePath` in `lib/seo.ts`), so when a bill moves its page names a new image URL
  and no platform keeps an old stage it cached by URL. The query only busts caches: the route
  ignores it. Bump `SHARE_CARD_VERSION` whenever the card's design changes.
- **Caching.** The route sends `public, max-age=86400, s-maxage=86400,
  stale-while-revalidate=604800`, replacing `next/og`'s default of a year and `immutable`.
  The middleware leaves it alone (`setsOwnCacheControl`).
- **Failures.** An unknown bill is a 404. A failed Convex lookup is a `307` to the site's
  generic card, `/images/og-default.png`, sent `no-store`: a 404 there would be cached by
  crawlers as "this link has no picture" for as long as they like. `lookupBill` in
  `app/bills/[id]/get-bill.ts` keeps those two cases apart; the page treats both as a 404,
  as before.
- **Fonts.** A Worker has no filesystem to read a `.ttf` from, and fetching one from Google on
  every render would put a third party in the path of every preview, so Newsreader (500, 600),
  Geist 500 and Geist Mono 500 are embedded in `lib/og/fonts.ts` as base64 TTF, subset to
  Latin-1 and common punctuation (~130 KB). `scripts/generate-og-fonts.ts` rebuilds that file
  (manual, needs `pip install fonttools`). A character outside the subset falls back to
  `next/og`'s bundled Geist Regular.
- **Cost.** About 100 ms of CPU and 60–90 KB of PNG per render. `next/og` added ~0.86 MB
  gzipped to the Worker (1.78 → 2.64 MB, measured with `wrangler deploy --dry-run` on
  2026-09-25), mostly resvg's WebAssembly. OpenNext's build swaps in `next/og`'s edge
  build for Workers (`patchVercelOgLibrary`); the route was checked in local `wrangler dev`
  as well as `next start`.
- **Other pages** still use the generic card from `app/layout.tsx` (`DEFAULT_OG_IMAGE`,
  built by `scripts/generate-og-image.ts`).
- **Tests.** `lib/og/bill-share-card.test.ts` checks the stage wording, the title cut, the
  versioned URL, and renders a real PNG for every awkward case (vetoed, an unknown stage, no
  sponsor, a 280-character title with characters outside the font subset).

A preview that has already been sent is a picture in someone's conversation: it does not
change when the bill moves. Only new shares, and platforms that re-read the page, see the new
stage.

### The installed app (PWA)

The site installs to a phone's Home Screen or a computer's dock and opens full screen.

- **Manifest** (`app/manifest.ts`): a fixed `id` so a later `start_url` change is not a new
  app, `scope`, standalone display, paper and ink colours, the 192 and 512 icons listed once
  as `any` and once as `maskable` (the app icon already keeps the chamber inside the maskable
  safe zone), and three shortcuts on a long press: All bills, Bills that became law, Your
  saved bills. iOS reads the name, the `apple-touch-icon` and `appleWebApp` from
  `app/layout.tsx`.
- **Service worker** (`public/sw.js`), registered in production only by
  `components/pwa/pwa-setup.tsx`. It has one job: when a page is opened with no connection,
  serve `public/offline.html` instead of the browser's error screen. It caches nothing else —
  every page, chunk and API call goes to the network as if it were not there — so it cannot
  hide a deploy behind a stale copy or fight skew protection. Navigation preload is on, so it
  costs a navigation no time. `public/_headers` serves both files `no-cache`. If it ever
  grows a page or asset cache, deploy skew (`deploymentId` in `next.config.mjs`) has to be
  handled first. Bump `OFFLINE_CACHE` in it when `offline.html` changes.
- **"Install the app"** in the footer (`components/pwa/install-app-button.tsx`) appears only
  where it can act: on Chrome, Edge and Android once the browser has offered its install
  prompt (held in `lib/pwa.ts`, without `preventDefault`, so the browser's own install UI is
  unchanged), and on iPhone and iPad, where it opens a three-step "Add to Home Screen" dialog
  because iOS has no prompt to call. It is hidden once the site runs as the app.
- **Analytics.** Every event carries a `display_mode` super property (`browser` or
  `standalone`), and installs are recorded as `app_install_clicked` and `app_installed`
  (Chromium only; Safari sends no install signal).

Not done: push notifications (bill alerts stay email), offline reading of bills, and store
screenshots in the manifest.

## Environment variables

### Frontend / build-time

Inlined by Next at **build** time, so they must be present wherever `pnpm cf:build` runs.
`.env.example` ships all five.

| Variable | If unset |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | Convex client is `null`, `useConvexEnabled()` is false, the dashboard shows "Backend not connected", `/api/answer` returns 503 |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Falls back to `convexUrl.replace('.convex.cloud', '.convex.site')` |
| `NEXT_PUBLIC_POSTHOG_KEY` | `posthog.init()` is never called; every analytics helper silently no-ops |
| `NEXT_PUBLIC_POSTHOG_HOST` | Falls back to `https://us.i.posthog.com`. Production uses `https://t.billsincongress.com` |
| `CONVEX_DEPLOYMENT` | Convex CLI only — no `process.env` reference in app code |

All four `NEXT_PUBLIC_*` are also GitHub repo secrets, injected by `ci.yml` and `deploy.yml`.
`CLOUDFLARE_ACCOUNT_ID` is a literal in `deploy.yml`, not a secret. `CONVEX_DEPLOY_KEY` lives
only in an untracked local `.env` and is deliberately **not** a GitHub secret.

### Convex deployment side

Set with `npx convex env set --prod`. Ten are configured in production; the Pro rows below
are new and not yet set anywhere.

| Variable | Purpose | Default if unset |
| --- | --- | --- |
| `CONGRESS_API_KEY` | Congress.gov v3 | Throws `"CONGRESS_API_KEY not configured"` |
| `OPENROUTER_API_KEY` | OpenRouter bearer token | AI returns "not configured" |
| `OPENROUTER_MODEL` | Model override | `deepseek/deepseek-v4-flash-0731` |
| `OPENROUTER_PROVIDERS` | Provider pin | `deepinfra,amazon-bedrock` |
| `OPENROUTER_FALLBACK_MODELS` | Failover chain | Default chain — **blank disables failover** |
| `POSTHOG_EMAIL_CODES_WEBHOOK_URL` | Webhook URL of the "Bills.Congress: sign-in codes" workflow | none — sign-up shows "Could not send verification email." |
| `POSTHOG_EMAIL_WEBHOOK_SECRET` | The `Bearer` value that workflow's trigger requires | none — same |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth | none |
| `JWT_PRIVATE_KEY` / `JWKS` | Convex Auth token signing | none |
| `SITE_URL` | Auth redirect base; also the base of Stripe return URLs and alert-email links | library default; billing and alerts fall back to `https://billsincongress.com` |
| `STRIPE_SECRET_KEY` | Stripe API key (Checkout, portal, webhook re-reads) | Checkout returns `BILLING_NOT_CONFIGURED` |
| `STRIPE_WEBHOOK_SECRET` | Verifies `POST /stripe/webhook` | Webhook answers 500; Stripe retries |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` | The two Pro price ids | Checkout returns `BILLING_NOT_CONFIGURED` |
| `STRIPE_PORTAL_CONFIGURATION` | A specific customer-portal configuration id | Stripe's default portal configuration |
| `POSTHOG_EMAIL_ALERTS_WEBHOOK_URL` | Webhook URL of the "Bills.Congress: bill alerts" workflow | Alert sends fail and are logged; the bills stay marked as reported |
| `POSTHOG_EMAIL_BILLING_WEBHOOK_URL` | Webhook URL of the "Bills.Congress: billing" workflow | Plan-change emails fail and are logged; the plan itself is still recorded |
| `ALERTS_UNSUBSCRIBE_SECRET` | Signs unsubscribe tokens | Digest sends fail rather than mail without a working unsubscribe link |
| `ALERT_EMAILS_LIVE` | `true` lets alert email reach real addresses | Every alert send is logged and skipped |

> `CONGRESS_API_KEY` and the `OPENROUTER_*` variables are read by **Convex server code**.
> Putting them in `.env.local` does nothing — this project never runs `convex dev`.
>
> Note the name collision: `SITE_URL` is also a hardcoded TypeScript constant
> (`'https://billsincongress.com'`) in `lib/seo.ts`, `convex/llm.ts` and `convex/answer.ts`.
> Those are unrelated to the Convex environment variable.

---

## Build, test and deploy

The package manager is **pnpm**, pinned to 10.33.0. There is no `engines` field; Node 24 is
pinned only inside the workflows.

| Script | What it does |
| --- | --- |
| `pnpm dev` | Local dev server |
| `pnpm test` | The whole test system (below) |
| `pnpm cf:build` | **The production build** — icons, then the OpenNext Cloudflare compiler |
| `pnpm preview` | Runs `cf:build`, then a local `workerd` preview of the result |
| `pnpm deploy` | Build and upload to Cloudflare. **Owned by `deploy.yml` — do not run by hand** |
| `pnpm build` / `pnpm start` | Icons, then a plain Next build/server. Local convenience only; nothing deploys them |
| `pnpm check:retention` / `check:web-citations` / `check:grounding` | Manual AI probes |

**There is no linter or formatter in this repository** — no ESLint, Prettier or Biome
dependency and no config file. The static gates are TypeScript (`next build` runs with
`ignoreBuildErrors: false`), the explicit `tsc --noEmit` in the review workflow, and the two
repository-invariant guards described below. Any claim that "the build includes lint" is
false.

### The test system

`scripts/run-tests.ts`. Each `*.test.ts` is a plain script executed with `tsx`, no framework.
Files are **discovered**, not listed:

```
git ls-files --cached --others --exclude-standard '*.test.ts'
```

Tracked and untracked-but-not-ignored files both match, so a newly saved test runs
immediately. If `git` fails, the script exits 1 rather than degrading to "found nothing".

`MIN_TEST_FILES = 25` is a floor, not a count (55 files match today): if discovery ever finds
fewer, the run fails, and deleting tests below it means lowering the constant in the same
commit, which is the point — a reviewer sees the intent. The rationale in the header is that
iterating an empty list *succeeds*, so a broken discovery would report green having verified
nothing, and "a green result that proved nothing is worse than a red one, because it is
trusted." The run ends by printing how many files and guards actually ran.

Then the two guards run (not counted toward the floor, but counted toward failure).
`check-metered-model-calls.ts` exists because of a real incident: `answer.ts`'s `ask` once
shipped as a public action with no auth and no limiter, beside a properly metered `stream`.
`check-no-userid-args.ts` enforces the identity rule statically — no public Convex function
may accept a `userId` argument.

Last, `vitest run` executes the **Convex function specs**, `convex/**/*.spec.ts` (config in
`vitest.config.mts`). These run real queries, mutations and HTTP actions against an in-memory
database with `convex-test`, which needs vitest's `import.meta.glob` — that is the only reason
vitest is here. `convex/pro.spec.ts` covers the Pro plan end to end: plan changes from
subscription events, question allowances, checkout refusing a second subscription (paid but
not yet confirmed, unpaid, two open tabs), the digest (new, late same-day, status change,
stage-only move on a long bill, lapsed reader and their catch-up email on return, no double
send, PostHog retries), the unsubscribe token, and the Stripe webhook with a signed payload
(`fetch` is stubbed with a real sandbox subscription reply; a forged signature is rejected).
Nothing in it reaches Stripe, PostHog or any deployment. `convex deploy` skips these files,
like every file name with more than one dot.

### CI

Two required status checks on every pull request, plus one workflow that only runs when
somebody asks it to:

| Workflow | Job | Trigger | Steps |
| --- | --- | --- | --- |
| `ci.yml` | `build` | every PR push | install (frozen lockfile) → `pnpm test` → `pnpm cf:build` |
| `claude-code-review.yml` | `review` | every PR push | install → capture `pnpm test` and `tsc --noEmit` output → automated code review |
| `claude.yml` | `claude` | an `@claude` comment | install → answer the comment in the thread |

`main` is protected by a **repository ruleset** (`main`, id 21753630), not classic branch
protection — the classic settings page will look empty. It requires a pull request (0
approvals), requires both `build` and `review`, blocks deletion and non-fast-forward pushes,
and has no bypass actors.

`ci.yml` deliberately has **no `branches:` filter**. It used to be `branches: [main]`, which
silently skipped the build on PRs based on another branch; one PR could not merge once
`build` became required and had to be reopened.

All third-party actions are pinned to **commit SHAs**, not tags — a tag is mutable, and
whoever controls it controls what runs in the repository, which matters most in `deploy.yml`,
the file holding the Cloudflare credential.

The reviewer's tool allowlist is deliberately read-only with two exceptions (`pnpm test` and
`tsc --noEmit`). `Bash(pnpm:*)` is refused because it would permit `pnpm dlx <anything>`;
`tsc` is pinned to `--noEmit` because bare `tsc` accepts `--outFile` and is therefore a file
writer.

### Asking Claude a question on a PR

`claude.yml` is the on-demand companion to the automatic reviewer. Mentioning `@claude` in a
PR comment, a review comment or a review body starts a run that reads the repository, can run
`pnpm test` and `tsc --noEmit` to check itself, and **replies in the thread**.

**It answers; it does not commit.** Its permissions stop at `contents: read` and its allowlist
contains no `Edit`, `Write` or `git push`, so a mention cannot rewrite a branch. Fixes come
back as a diff in the comment for a person (or another tool) to apply.

Three things that make it look broken when it is not:

- **It only works from `main`.** `issue_comment` always runs the workflow as it exists on the
  default branch, never the copy on the PR branch — so adding or editing this file in a branch
  and commenting there does nothing.
- **Comments posted before it merged never fire.** There is no backfill; post a fresh one.
- **A 👀 reaction and then silence** is the signature of the missing workflow, not a hung run.
  The `claude[bot]` App acknowledges the mention; without a workflow there is nothing to run
  the work in.

Only users with write access can trigger it — the action enforces that itself. It does not
cancel in-progress runs (`cancel-in-progress: false`): a mention is something a person typed
on purpose, so a second one queues rather than silently dropping the first. The `if:` guard
also requires `github.event.sender.type != 'Bot'`, because `track_progress` makes the job post
its own comments and `issue_comment` does not care who wrote them — without the guard it
retriggers itself in a loop.

### Deploy

Any push to `main` (or a manual dispatch) triggers `deploy.yml`, which runs `pnpm run deploy`.

- **The deploy workflow runs no tests.** Tests gate pull requests only.
- Deploys are **serialized, never cancelled** (`group: deploy-production`,
  `cancel-in-progress: false`) because merging four PRs inside a minute once started four
  racing deploys. A burst now collapses to "finish the current deploy, then deploy the newest
  commit."

### Deploying Convex

```bash
npx convex deploy
```

In a checkout with no `CONVEX_DEPLOYMENT` (a fresh clone or a worktree), name production
explicitly, and dry-run it first:

```bash
CONVEX_DEPLOYMENT=prod:industrious-llama-331 npx convex deploy --dry-run   # preview
CONVEX_DEPLOYMENT=prod:industrious-llama-331 npx convex deploy             # the real deploy
```

**Manual, and shared.** Every worktree, branch and local dev server talks to the same
production Convex deployment.

> **`convex deploy` pushes the local `convex/` directory wholesale.** Deploying from a branch
> that has not merged `origin/main` **reverts** every Convex-side feature merged since that
> branch diverged. This has happened — it once clobbered the saved-bills functions.
> **Always merge `origin/main` before running `npx convex deploy`.**

> **Merging a PR does NOT deploy the backend.** The GitHub Actions workflow above deploys the
> Next.js site to Cloudflare; it does not touch `convex/`. Production once ran three days behind
> `main` on the answer engine, and for the whole of that time readers on a bill page were told
> about a different bill — confidently, with working citations, because the fix that seeds the
> focused bill's row had been merged and never shipped.
> **After merging any PR that touches `convex/`: `git checkout main && git pull && npx convex deploy -y`.**

**Changes that need a recompute, not just a deploy.** Some Convex changes add a field to a
precomputed table, and the deploy alone leaves that field empty on every existing row. The
handlers are written to treat a missing value as "we do not hold this" rather than falling back
to a wider figure, so an un-recomputed field degrades honestly — but it does not answer the
question until the job runs. After deploying such a change:

```bash
npx convex run congressApi:triggerRecomputeStats
```

This is required for the per-chamber `stageCounts` on `congressChamberBreakdowns` and the
per-type `typeCounts` on `congressStats`; until it runs, a chamber-scoped stats row reports that
it holds no stage ladder instead of quoting the whole-Congress one, and the whole-Congress row
says it cannot split measures into bills and resolutions rather than letting the measure total be
read as a bill count.

---

## Hosting and Cloudflare constraints

One Cloudflare Worker named `billsincongress`, serving `.open-next/worker.js` with static
assets bound as `ASSETS`. Smart placement is on so the Worker sits near the single-region
Convex backend; `cpu_ms` is capped at 10,000 as a cost guardrail.

Page caching uses two KV namespaces — `NEXT_INC_CACHE_KV` (rendered output) and
`NEXT_TAG_CACHE_KV` (cache-tag mappings) — with `queue: "direct"` because the Workers runtime
limits background timers.

> **The KV cache backends are mandatory, not an optimisation.** The app revalidates on a
> schedule. Without real backends, OpenNext falls back to a "Dummy" cache that **throws** —
> the cause of intermittent Worker `1101` exceptions that broke pages at random.

> **Cache Components, `'use cache'` and PPR must stay disabled.** They crash on Workers.
> `next.config.mjs` has no `experimental` block at all, and `app/page.tsx` records the
> history: the home page prefers plain dynamic rendering over the previous Cache Components
> streaming, "which did not render reliably on the Cloudflare Workers runtime." Separately,
> an earlier version of the comment in `open-next.config.ts` stated the app *uses* Cache
> Components — wrong in a dangerous direction, because it read as a reason to turn them back
> on.

**`keep_names: false`** in `wrangler.jsonc`: esbuild's keep-names (on by default in Wrangler)
injects a `__name` helper into stringified inline scripts — such as next-themes' pre-paint
theme script — producing `ReferenceError: __name is not defined` in the browser.

**`next/og` works on Workers** because OpenNext's build replaces its Node build with the edge
build and bundles the WebAssembly (`patchVercelOgLibrary` in `@opennextjs/cloudflare`). Fonts
cannot be read from disk at request time, which is why the share card embeds its own
(see [Link previews](#link-previews-the-share-card)).

**`middleware.ts`, not `proxy.ts`.** Next 16's `proxy.ts` convention is locked to the Node.js
runtime, which the Cloudflare/OpenNext adapter does not support; it requires Edge middleware.
`convex/auth.ts` still contains a comment pointing at `proxy.ts` — that pointer is stale; the
constant it means lives in `middleware.ts`.

### Security headers

Set in `next.config.mjs` for all Worker-rendered paths: `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` denying camera/microphone/geolocation/interest-cohort, and HSTS for one
year with `includeSubDomains`. **`preload` is deliberately omitted** — it ships the domain
inside browsers and is slow to undo.

**There is deliberately no Content-Security-Policy.** A real one would need to allowlist the
Convex deployment, Google OAuth endpoints and the analytics origin, and would break things if
rolled in unattended. It is a separate exercise.

`public/_headers` sets caching only (fingerprinted chunks for a year, `sw.js` and
`offline.html` `no-cache`), and reaches **only** Cloudflare's static-asset layer —
anything site-wide must be set in both that file and `next.config.mjs`.

---

## Operations runbook

All commands take `--prod` to hit production. `npx convex run` invokes internal functions as
admin.

**Sync and repair**

```bash
npx convex run --prod congressApi:syncOneBill '{"congress":118,"billType":"hr","billNumber":"5193"}'
npx convex run --prod congressApi:reconcileMissingBills '{"congress":118}'
npx convex run --prod congressApi:repairIncompleteBills '{}'
npx convex run --prod sync:getSyncCompleteness '{}'
```

**Rollups**

```bash
npx convex run --prod congressApi:triggerRecomputeStats '{}'
npx convex run --prod mutations:recomputeCommitteeBaseRates
```

**Diagnostics**

```bash
npx convex run --prod bills:debugBillStage '{"billId":"4199s118"}'
npx convex run --prod bills:debugBillEnrichment '{"billId":"1hr119"}'
npx convex run --prod indexNow:queueDepth '{}'
npx convex run --prod users:_inspectAuthState '{"email":"..."}'
```

**Destructive — read the warning first**

```bash
npx convex run --prod congressApi:deleteCongress '{"congress": 108}'
```

Irreversible: the next incremental sync only re-pulls the last 26 hours of the *current*
Congress, so a deleted historical Congress does not come back on its own.

### Common problems

| Symptom | Likely cause |
| --- | --- |
| A query times out | A full table scan. Use a precomputed table or an index; `.collect()` on `bills` exceeds Convex's 16,384-document transaction limit |
| The assistant says it has no count | The filter combination could not be read completely, so it was given no number rather than a wrong one. Adding an index for that pair in `convex/schema.ts` — and a branch in `convex/catalog/billsIndex.ts` — makes it exact |
| The assistant refuses to name "the most recent" | The result came back `order: "arbitrary"`. Either the question needs a `sort` filter, or the set is too big to read completely and the sort was honestly refused |
| A filtered list looks short | The 1,200-row scan cap — see [query limits](#query-limits-and-how-truncation-is-surfaced). If the page says "partial list" it is working as intended; if it does not, the filter has an index and the list is complete |
| AI chat 404s after a deploy | The provider allowlist and the OpenRouter **account** setting no longer overlap |
| "The answer service is not deployed yet" | The frontend shipped but Convex did not. Run `npx convex deploy` |
| A Congress shows with 0 bills | The nightly 04:00 recompute will clean it up, or delete it manually |
| Intermittent Worker `1101` errors | The KV cache bindings are missing or misconfigured |
| Data looks stale | Check `bills:getSyncStatus`; the daily sync runs 01:00 UTC and stats rebuild at 04:00 UTC |
| A reader paid but is still Free | The webhook did not land. Check `stripeEvents` for a `failed` row and the endpoint's delivery log in Stripe; `STRIPE_WEBHOOK_SECRET` must be that endpoint's own secret |
| No alert emails at all | `ALERT_EMAILS_LIVE` is not `true` (test mode), or `ALERTS_UNSUBSCRIBE_SECRET` is unset (every send throws) |

---

## Conventions

**Where components live.** A component used by exactly one route lives beside it
(`app/learn/components/`, `app/bills/_hub/`). Anything shared lives under `components/`.

**Pure modules are pure.** `convex/billStage.ts`, `chamber.ts`, `baseRates.ts`,
`searchQuery.ts`, `syncStatus.ts` and everything in `lib/` that has a `.test.ts` beside it
import nothing from Convex, so the arithmetic is testable without a database. Keep new
business logic in that shape — the alternative is logic that can only be tested by deploying.

**Analytics are part of the feature.** `Documentation/ANALYTICS.md` is the registry and
`lib/analytics.ts` its typed counterpart. Adding a feature requires a registry row, a typed
helper and a call site in the same commit; removing one requires deleting the helper and
call sites and moving the rows to "Retired events" with a date. Never call
`posthog.capture()` with a raw string from a component, and never rename an existing event —
it breaks every saved insight built on it. This is the whole analytics section of
`AGENTS.md` (rules 1–5) and the reviewer's priority 2.

**Documentation is part of the feature too.** Any feature built or deleted requires re-reading
the README and everything in `Documentation/` and updating whatever no longer matches, in the
same change.

**Plans and specs are never committed.** `.gitignore` covers `/docs/` and `/*-plan.md`.

**`AGENTS.md` is the committed house-rules file.** `CLAUDE.md` is gitignored.

---

## Dead code and known gaps

Recorded so nobody rediscovers them as bugs.

### Dead

| Thing | Status |
| --- | --- |
| `app/api/bill-chat/send`, `convex/llm.ts`, `billChats` / `billChatMessages`, `billsService.sendChatMessage` | The old per-bill chat. Replaced 26 Aug 2026. The route is still deployed and publicly callable but nothing in the UI calls it. Its analytics event `bill_chat_message_processed` last fired 27 Aug 2026 |
| `app/api/bill-chat/usage` | **Not** dead — the account page still reads it for the quota meter |
| `usageEvents`, `billTitles` tables | Defined in the schema, never read or written (`billTitles` is only ever deleted) |
| `congressApi.dailySync` | Legacy entry point, wired to no cron, delegates to `incrementalSync` |
| `bills.getCongressInfo`, `billCountsByCongress`, `latestCongressStatus`, `getPolicyAreas` | Public queries with no caller. `getCongressInfo` also has an off-by-one: it returns `endYear = startYear + 2` (119th → 2025–2027), disagreeing with `lib/congress.ts` |
| `pnpm optimize-images`, `pnpm cf-typegen` | Produce output nothing reads |
| `parseMarkers` in `catalog/cite.ts` | Exported, referenced only by its own test |

### Gaps worth fixing

1. **The live answer path has no server-side analytics** and does not forward the PostHog
   identity headers, so a failure before the browser sees a response is invisible.
2. **The three manual AI probe scripts have drifted**: two default `OPENROUTER_PROVIDERS` to
    `deepinfra` alone while the shipped default is `deepinfra,amazon-bedrock` — so they can
    bless a configuration that is not what production runs.
