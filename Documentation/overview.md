# Project overview

How billsincongress.com is put together: where the data comes from, how it is stored, how
the AI answers are grounded, and how the whole thing is built and shipped.

For what the site *is* and what a visitor sees, read the [README](../README.md). For
analytics, read [ANALYTICS.md](ANALYTICS.md). For the home-page dashboard and the
precomputed-analytics pattern, read [interactive-dashboard.md](interactive-dashboard.md).

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
      │  nine scheduled jobs — convex/crons.ts
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
    _hub/                  Hub view, directory and view-tracker (route-private)
    topic/[slug]/          33 policy-area hubs
    house|senate|enacted|in-committee|passed-one-chamber|introduced|vetoed/
  learn/                   Illustrated civics guide
    components/            Route-private: capitol, seat charts, journey, quiz, …
  about/ privacy/ terms/   Content and legal
  account/                 The only signed-in page
  sign-in/ sign-up/ forgot-password/
  api/                     answer/, bill-chat/send, bill-chat/usage
  robots.ts sitemap.ts sitemap_index.xml/ llms.txt/ manifest.ts
  layout.tsx template.tsx not-found.tsx shared-metadata.ts globals.css

components/                Shared React components
  answers/                 The ask panel: provider, panel, thread, sources, work log, history
  bills/                   Card, details, progress, filters, sponsor combobox, save button
  dashboard/               DashboardClient.tsx (the whole dashboard, one file)
  auth/ analytics/ legal/ seo/ theme/ ui/
  navigation.tsx footer.tsx podcast-promo.tsx waving-flag.tsx
  convex-client-provider.tsx theme-provider.tsx

lib/                       Pure client/shared modules — 25 modules + 15 test files
  analytics.ts             Typed PostHog helpers — the only place the browser's
                           posthog.capture() is called. Server events go through
                           lib/posthog-server.ts. Convention only; no guard enforces it.
  seo.ts hubs.ts pagination.ts cacheable-routes.ts indexnow.ts
  answer-entities.ts answer-format.ts answer-scope.ts search-query-guard.ts
  transcript-cap.ts starter-questions.ts bill-query.ts error-filter.ts
  services/bills-service.ts  constants/  types/  utils/

convex/                    Backend — 30 top-level modules + catalog/ + 9 test files
  schema.ts                24 application tables (+ 6 from the auth library)
  bills.ts                 Public read surface
  mutations.ts             All sync writes and rollup writers
  congressApi.ts           Congress.gov sync, reconcile, repair, backfill
  answer.ts catalog/       The grounded answer engine
  chats.ts savedBills.ts users.ts auth.ts   Accounts
  crons.ts rateLimits.ts indexNow.ts aggregates.ts functions.ts http.ts
  billStage.ts chamber.ts baseRates.ts searchQuery.ts syncStatus.ts   Pure, unit-tested

scripts/                   run-tests.ts, two CI guards, three AI probes, image tooling
public/                    Icons, images, _headers, the IndexNow key file
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
| `/sign-in`, `/sign-up`, `/forgot-password`, `/account` | Accounts (`/account` is the only protected route) |
| `/api/answer` | POST — proxies to Convex `/answer/stream`, attaching auth and anonymous cookies |
| `/api/bill-chat/usage` | GET — daily quota, read by the account page |
| `/api/bill-chat/send` | POST — **dead**, see [Dead code](#dead-code-and-known-gaps) |
| `/robots.txt`, `/sitemap_index.xml`, `/sitemap/<n>.xml`, `/llms.txt`, `/manifest.webmanifest` | Machine-readable |

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
`/privacy`, `/terms` and anything under `/bills` get
`public, max-age=0, s-maxage=300, stale-while-revalidate=86400`; any request carrying an
auth cookie gets `private, no-store`. **New public routes must be added to that file.**

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

### The nine cron jobs

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
| `billActions` | Legislative actions, up to 250 per bill |
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
| `users` | Name, email, image, verification time, plan. Also carries six unused billing columns (five `stripe*` plus `cancelAtPeriodEnd`). `plan` itself is live — it drives the account page, the user menu and the PostHog identify call |
| `savedBills` | One row per (user, bill) bookmark |
| `chats` / `chatMessages` | Saved answer conversations, frozen with their citations, entities and work log |
| `billChats` / `billChatMessages` | The old per-bill chat. Still written by the dead route |
| `billChatAnalyticsSessions` / `billChatAnalyticsTurns` | Signed-in per-bill chat analytics |
| `indexNowQueue` | Bills whose pages changed and search engines have not been told |
| `stripeEvents`, `usageEvents` | **Dead** — zero references outside `schema.ts` |

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

117 hand-written functions — 23 public queries, 4 public mutations, 1 public action, 1 HTTP
action, 88 internal — plus four more generated by `convexAuth()` in `auth.ts`: `signIn` and
`signOut` (public actions), `isAuthenticated` (public query) and `store` (internal mutation).
121 registered in total.

| File | Role |
| --- | --- |
| `bills.ts` | The public read surface (18 functions: 14 public queries plus 4 internal) |
| `mutations.ts` | Every sync write and rollup writer (30: 19 internal mutations, all trigger-wrapped, plus 6 internal queries and 5 internal actions) |
| `congressApi.ts` | Sync, reconcile, repair, backfill (19) — **every one an `internalAction`** |
| `answer.ts`, `catalog/` | The grounded answer engine |
| `chats.ts`, `savedBills.ts`, `users.ts`, `auth.ts` | Accounts |
| `llm.ts` | The old per-bill chat back end. Holds the only hand-written public action (`sendChatMessage`), reached solely by the dead `/api/bill-chat/send` route |
| `indexNow.ts` | Search-engine notification (10, all internal) |
| `rateLimits.ts` | The limiter config plus `getChatUsage`, the one public query behind the account page's quota meter |
| `sync.ts`, `aggregateBackfill.ts`, `policyAreaBackfill.ts`, `chatAnalytics.ts` | Operational backfills and diagnostics, almost all internal |
| `crons.ts`, `http.ts`, `convex.config.ts`, `functions.ts` | Schedule, HTTP router, installed components, trigger-wrapped constructors |
| `billStage.ts`, `chamber.ts`, `baseRates.ts`, `searchQuery.ts`, `syncStatus.ts` | Pure modules, no Convex imports, unit-tested |

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
  └─ fetch POST /api/answer
       └─ app/api/answer/route.ts           exists ONLY to attach the httpOnly auth cookie
            │                                and the anonymous session cookie
            └─ POST {CONVEX_SITE_URL}/answer/stream     (convex/http.ts → answer.stream)
                 ├─ rate-limit check  ← the token is consumed BEFORE the model is called
                 ├─ tool loop, max 4 rounds
                 │    ├─ describe_dataset
                 │    ├─ fetch_dataset   → convex/catalog/fetch.ts
                 │    └─ search_web      → OpenRouter web plugin, engine "exa"
                 ├─ citation resolution → convex/catalog/cite.ts
                 └─ SSE frames back: work · delta · done · rate_limited · error
```

The panel is mounted in the root layout as a **sibling** of the page content, never inside
it, so a conversation survives client-side navigation. Prose is emitted only *after* citations
are resolved, in 60-character chunks — never token by token, because a fabricated citation
must not be visible even briefly.

### Grounding

The model never writes a query. It names one of **six datasets** — `bills`, `bill_actions`,
`bill_summaries`, `topics`, `sponsors`, `stats` — and passes filters to whitelisted
server-side handlers that choose the index, ordering and caps. A unit test asserts the list
is exactly those six.

| Limit | Value |
| --- | ---: |
| Tool rounds | 4, then the model must answer with what it has and the answer is flagged `partial` |
| Rows per fetch | 20 default, 50 max |
| Scan window | 200 rows — when it fills, the count is returned as `total_is_at_least` so the model must say "at least N" |
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

5 questions/day signed out, 100/day signed in. Fixed windows (all tokens granted at window
start, no carry-over) aligned to midnight US Eastern. The signed-out limit is keyed to an
httpOnly, SameSite=Lax cookie `bic_bill_chat_session` holding a random UUID, 60-day lifetime.
OTP emails are separately limited to 5 per hour per address.

**The daily token is consumed before the model is called** — a mid-flight failure costs the
user that question. The rate limiter is the only spend cap on this path.

### Guardrails

| Script | Runs | Enforces |
| --- | --- | --- |
| `scripts/check-no-userid-args.ts` | `pnpm test` | No **public** Convex function accepts a `userId` argument — identity must come from `getAuthUserId(ctx)` |
| `scripts/check-metered-model-calls.ts` | `pnpm test` | In any module reading `OPENROUTER_API_KEY`, every public `action`/`httpAction` calls `rateLimiter.limit` |
| `pnpm check:retention` | Manual, needs a key | Whether the retention flags still leave any provider able to serve, for the primary **and every fallback** |
| `pnpm check:web-citations` | Manual, needs a key | Whether the web plugin still returns the `url_citation` annotations the code parses |
| `pnpm check:grounding` | Manual, needs a key | End-to-end: drives the real prompt, tools and resolver against the live model with fixtures, and fails if the model invents a co-sponsor count, cites nothing real, leaks a raw marker, or reaches for the web when our own data answers |

Re-run the three manual probes whenever the model or provider pin changes.

---

## Accounts and auth

`@convex-dev/auth` with two providers: **Google OAuth**, and **email + password** with a
6-digit code emailed via Resend that expires in 15 minutes. Passwords must be ≥10 characters
with upper case, lower case and a digit, enforced server-side; they are stored only as a
scrypt hash by the library.

Sessions last **60 days** (both total and inactive), and the cookie `maxAge` in
`middleware.ts` must stay ≥ that value.

An account gets you exactly three things today: bookmarking bills (the account page lists the
most recent 200), saved conversation history, and the higher daily question allowance. There
is no paid tier, no Stripe dependency in `package.json` and no Stripe integration logic —
only the dead `stripeEvents` table and the six unused billing columns noted above.

Deliberate hardening worth preserving:

- Sign-in failures are vague — wrong email and wrong password produce the identical message,
  so the form cannot enumerate registered addresses. Sign-up phrases its confirmation as
  "If this email can be used…" and advances to the verify step even on some errors, for the
  same reason.
- Post-sign-in redirects are restricted to an allowlist (`billsincongress.com`, `www`,
  same-origin paths, plus `localhost:3000` / `127.0.0.1:3000` for local development).
- No public function takes a `userId` — enforced by a guard on every test run.

**Not built (UI only):** the password-reset *back end* is wired — `convex/auth.ts` passes
`reset: ResendOTPPasswordReset`, which emails a 6-digit reset code on the same rate-limit
bucket — but no page ever starts the flow, so `/forgot-password` is a static "coming soon"
page asking people to email. Self-serve account deletion does not exist at all; deletion is
handled by emailing `hi@billsincongress.com`. The Privacy Policy says so plainly.

---

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

Set with `npx convex env set --prod`. Ten are configured in production.

| Variable | Purpose | Default if unset |
| --- | --- | --- |
| `CONGRESS_API_KEY` | Congress.gov v3 | Throws `"CONGRESS_API_KEY not configured"` |
| `OPENROUTER_API_KEY` | OpenRouter bearer token | AI returns "not configured" |
| `OPENROUTER_MODEL` | Model override | `deepseek/deepseek-v4-flash-0731` |
| `OPENROUTER_PROVIDERS` | Provider pin | `deepinfra,amazon-bedrock` |
| `OPENROUTER_FALLBACK_MODELS` | Failover chain | Default chain — **blank disables failover** |
| `AUTH_RESEND_KEY` | Resend API key for OTP mail | none |
| `AUTH_EMAIL_FROM` | `From:` on OTP mail | `Bills.Congress <onboarding@resend.dev>` (Resend's shared sandbox) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth | none |
| `JWT_PRIVATE_KEY` / `JWKS` | Convex Auth token signing | none |
| `SITE_URL` | Auth redirect base | library default |

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

`scripts/run-tests.ts` — no test framework. Each `*.test.ts` is a plain script executed with
`tsx`. Files are **discovered**, not listed:

```
git ls-files --cached --others --exclude-standard '*.test.ts'
```

Tracked and untracked-but-not-ignored files both match, so a newly saved test runs
immediately. If `git` fails, the script exits 1 rather than degrading to "found nothing".

`MIN_TEST_FILES = 24` and there are currently exactly 24 files, so **there is zero
headroom**: deleting any test fails the run until the constant is lowered in the same commit,
which is the point — a reviewer sees the intent. The rationale in the header is that
iterating an empty list *succeeds*, so a broken discovery would report green having verified
nothing, and "a green result that proved nothing is worse than a red one, because it is
trusted." The run ends by printing how many files and guards actually ran.

Then the two guards run (not counted toward the floor, but counted toward failure).
`check-metered-model-calls.ts` exists because of a real incident: `answer.ts`'s `ask` once
shipped as a public action with no auth and no limiter, beside a properly metered `stream`.
`check-no-userid-args.ts` enforces the identity rule statically — no public Convex function
may accept a `userId` argument.

### CI

Two required status checks on every pull request:

| Workflow | Job | Steps |
| --- | --- | --- |
| `ci.yml` | `build` | install (frozen lockfile) → `pnpm test` → `pnpm cf:build` |
| `claude-code-review.yml` | `review` | install → capture `pnpm test` and `tsc --noEmit` output → automated code review |

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

**Manual, and shared.** Every worktree, branch and local dev server talks to the same
production Convex deployment.

> **`convex deploy` pushes the local `convex/` directory wholesale.** Deploying from a branch
> that has not merged `origin/main` **reverts** every Convex-side feature merged since that
> branch diverged. This has happened — it once clobbered the saved-bills functions.
> **Always merge `origin/main` before running `npx convex deploy`.**

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

`public/_headers` sets caching only, and reaches **only** Cloudflare's static-asset layer —
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
| A filtered list looks short | The 1,200-row scan cap — see [query limits](#query-limits-and-how-truncation-is-surfaced). If the page says "partial list" it is working as intended; if it does not, the filter has an index and the list is complete |
| AI chat 404s after a deploy | The provider allowlist and the OpenRouter **account** setting no longer overlap |
| "The answer service is not deployed yet" | The frontend shipped but Convex did not. Run `npx convex deploy` |
| A Congress shows with 0 bills | The nightly 04:00 recompute will clean it up, or delete it manually |
| Intermittent Worker `1101` errors | The KV cache bindings are missing or misconfigured |
| Data looks stale | Check `bills:getSyncStatus`; the daily sync runs 01:00 UTC and stats rebuild at 04:00 UTC |

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
| `stripeEvents`, `usageEvents`, `billTitles` tables | Defined in the schema, never read or written (`billTitles` is only ever deleted) |
| Six unused billing columns on `users` (five `stripe*` plus `cancelAtPeriodEnd`) | No Stripe dependency and no Stripe integration logic anywhere. `plan`, in the same block, is **not** dead |
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
