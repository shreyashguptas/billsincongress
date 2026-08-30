# The home-page dashboard

How the Congress dashboard on `/` is built, why its numbers are precomputed rather than
queried, and how to add a new metric without recreating a bug we have already had.

Figures in this document were read from production on **29 August 2026**. Treat them as
illustrative of magnitude, not as live values.

---

## Where things actually live

| Concern | Path |
| --- | --- |
| Home-page route (server component) | `app/page.tsx` |
| Dashboard UI (client component) | `components/dashboard/DashboardClient.tsx` |
| Dashboard queries | `convex/bills.ts` — `getAllCongressOverview`, `getCongressDashboard`, `getChamberDeepBreakdown` |
| Recompute jobs | `convex/mutations.ts`, orchestrated from `convex/congressApi.ts` |
| Precomputed tables | `convex/schema.ts` |
| Design tokens | `app/globals.css`, `tailwind.config.ts` |
| Fonts | `app/layout.tsx` |
| Closing decoration | `components/waving-flag.tsx` |

`components/dashboard/` contains exactly one file. **There is no charting library** — every
chart is hand-built from `div`s with computed inline widths and heights.

---

## The design system

### Typography

Three fonts, loaded with `next/font/google` in `app/layout.tsx` and exposed as CSS
variables:

| Role | Font | CSS variable | Tailwind |
| --- | --- | --- | --- |
| Display / headings | **Fraunces** | `--font-serif` | `font-serif`, `font-display` |
| Body / UI | **Inter** | `--font-sans` | `font-sans` |
| Numbers and labels | **JetBrains Mono** | `--font-mono` | `font-mono` |

A custom display scale runs `text-display-sm` (1.625rem) through `text-display-2xl`
(4.5rem); the dashboard uses `display-md`/`lg`/`xl` for its `h1` and `display-sm` for every
section `h2`. Two utility classes carry most of the editorial feel: `.label-eyebrow` (the
small-caps label above every section) and `.tabular` (tabular figures, applied to every
number so columns do not jitter).

### Colour

The design language comment in `app/globals.css` calls it *"Editorial Modernism — inspired
by serious civic journalism (ProPublica, Economist). Single accent, restrained palette,
typographic hierarchy."*

Every colour is an **HSL triplet in a CSS variable**, consumed as `hsl(var(--token))`. Light
mode is warm newsprint (hue ~40) with cool near-black ink (hue 220); dark mode is a genuine
second palette, not an inversion. The single accent is a deep masthead red. Border radius is
deliberately tiny (`--radius: 0.25rem`).

Bill-stage colours ramp neutral → blue → ochre → orange → red → green, so a bill visually
warms as it advances and only law is green:

| Token | Stage |
| --- | --- |
| `--status-introduced` | 20 Introduced |
| `--status-committee` | 40 In Committee |
| `--status-passed-one` | 60 Passed One Chamber |
| `--status-passed-both` | 80 Passed Both Chambers |
| `--status-president` | 90 To President |
| `--status-signed` | 95 Signed by President |
| `--status-law` | 100 Became Law |
| `--status-vetoed` | 85 Vetoed |

`--status-vetoed` is a cool desaturated slate, deliberately outside the warm advancing ramp,
because a veto is a dead end rather than a rung further up the ladder.

Party colours are `--party-d` (muted editorial blue), `--party-r` (muted editorial red),
`--party-i` (muted ochre) and `--party-u` (neutral grey). The three party hues brighten in
dark mode; the neutral grey stays put.

The dashboard applies status and party colours as **inline styles**, not Tailwind classes,
because widths and colours are computed at runtime. The `status-*` / `party-*` Tailwind
aliases exist for the rest of the site.

> Anything describing Playfair Display, Source Sans 3, or a navy/gold `--congress-*` palette
> is from a much older draft of this file. No such tokens exist in the codebase.

---

## What the page renders, in order

`app/page.tsx` is a server component: it reads `?congress=` (defaulting to **119**), fetches
four queries in one `Promise.all`, and hands them to `DashboardClient` as initial data. It
then renders the decorative flag as a server-only section so it costs no client JavaScript.

Before any data renders, `DashboardClient` checks `useConvexEnabled()` and shows a
"Backend not connected" panel if `NEXT_PUBLIC_CONVEX_URL` is unset — a missing backend
should look like a missing backend, not an empty dashboard.

| # | Section | What it shows | Drills through? |
| --- | --- | --- | --- |
| 1 | Hero / masthead | Eyebrow, headline "Every bill, every step, in plain view.", the `HeroAsk` box with three generated starter questions | Link to `/bills` |
| 1a | Congress selector | One button per Congress that has bills, newest first, labelled with year span and ordinal | Switches the view in place |
| 2 | "The evidence" divider | One line tying the numbers below to the answers above | No |
| 3 | Key metrics | Bills introduced · House bills · Senate bills · Became law | Cards 1 and 4 only |
| 4a | Status distribution | 12px stacked bar plus a legend table (swatch, label, share to 1dp, count) | Every segment and every row |
| 4b | Top policy areas | Top 8, name and count over a scaled bar | Yes |
| 5 | Leading sponsors | Top 10 table: rank, member, party, state, bill count | Whole row |
| 6 | Who's writing the bills | Per-chamber stacked party bar with a share/count/laws table, a combined passage-rate footnote, and a top-8 sponsoring-states list | States only |
| 7 | Introductions month by month | Two-track chart — introductions up, laws down, **each track independently scaled** — closing with a generated sentence naming busiest, quietest, and most-laws months | No |
| 8 | Volume across recent Congresses | One bar per Congress, max height 140px | Switches Congress |
| 9 | Podcast promo | "The Federalist Papers: Explained" | External links |
| 10 | Waving flag | Decorative, `aria-hidden`, reduced-motion aware | No |

Sections 2–8 live inside a cross-fade wrapper. Switching Congress does **not** blank the
page to a skeleton: the previous numbers stay on screen at 50% opacity and
`pointer-events-none` until the new data lands, so a drill-down can never fire against
numbers that no longer match the selection.

### "Ask about this"

Sections 4a, 4b, 5, 6, 7 and 8 each carry an `askQuestion` string that interpolates the
current Congress (for example *"Why do most bills never leave committee in the 119th
Congress?"*) and renders an `AskAbout` button. The comment in `DashboardClient.tsx` states
the rule: this sits **alongside** the drill-down and never replaces it, because browsing and
asking are different intents.

The masthead also mounts `<AskPageContext congress={viewCongress} />` beside `HeroAsk`. Every
catalog fetch defaults to the 119th Congress, so before this the selector and the answer engine
disagreed silently: a reader studying the 117th here and then asking a question was answered
about a different Congress entirely, with nothing on screen to say so. The selector's value now
travels with the question. See [The answer engine → Page context](./overview.md#page-context).

---

## The queries

Four calls, issued server-side in `loadDashboardData` and mirrored as live `useQuery`
subscriptions on the client.

| Query | Args | Reads | Returns |
| --- | --- | --- | --- |
| `bills.getAllCongressOverview` | none | `congressStats` collected | One row per Congress, ascending: totals, chamber split, `stageCounts`, `updatedAt` |
| `bills.getCongressDashboard` | `{ congress }` | 1 `congressStats` row, all `congressPolicyAreas` and `congressSponsors` for that Congress | `null` when there is no stats row, otherwise totals, `statusBreakdown`, top 10 sponsors, top 10 policy areas |
| `bills.getChamberDeepBreakdown` | `{ congress, chamber }` | 1 `congressChamberBreakdowns` row | Party counts, party law counts, state counts, monthly buckets — zero-filled when the row is missing |

`statusBreakdown` is an object keyed by stage **name** (`introduced`, `inCommittee`,
`passedOneChamber`, `passedBothChambers`, `vetoed`, `toPresident`, `signed`, `becameLaw`),
built by a switch over `stageCounts`. Absent stages stay `0`. `lib/starter-questions.ts`
depends on this exact shape and warns against "tidying" it.

`topPolicyAreas` and `topSponsors` are `.collect()` then `.slice(0, 10)` — they are "top N"
**only because the writers insert rows already sorted descending**. There is no `order()` on
the read. See [Known gaps](#known-gaps).

---

## Why the numbers are precomputed

### The four tables

| Table | Written by | Rows today |
| --- | --- | --- |
| `congressStats` | `writeCongressStats` (patch-or-insert) | 3 |
| `congressPolicyAreas` | `writeCongressPolicyAreas` (delete-all-then-insert in one transaction) | ≤ 33 per Congress (31 for the 119th) |
| `congressSponsors` | `writeCongressSponsors` (delete-all-then-insert) | ~550 per Congress (550 / 595 / 552 for 119 / 118 / 117) |
| `congressChamberBreakdowns` | `writeCongressChamberBreakdown` (patch-or-insert) | 6 (3 Congresses × 2 chambers) |

`stateCounts` is stored as an **array rather than a record**, because Convex object keys must
be valid identifiers and an odd state code should not be able to break the schema. It is
converted back with `Object.fromEntries` on read.

### The argument, with real numbers

Live `congressStats`, 29 August 2026:

| Congress | Total | House | Senate | Introduced | In committee | Passed one | Passed both | Vetoed | Became law |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 117 | 17,828 | 11,472 | 6,356 | 564 | 16,721 | 176 | 2 | 0 | 365 |
| 118 | 19,315 | 12,556 | 6,759 | 575 | 18,229 | 224 | 0 | 13 | 274 |
| 119 | 18,472 | 12,005 | 6,467 | 479 | 17,693 | 194 | 0 | 2 | 104 |

Stages 90 and 95 are zero in all three Congresses — the pipeline records those transitions
as "Became Law", which is why no hub page exists for them either.

Documents read per home-page load:

| Query | Reads now | Would read by scanning `bills` |
| --- | ---: | ---: |
| `getAllCongressOverview` | 3 | 55,615 |
| `getCongressDashboard` (119) | ~582 (1 stats + 31 policy areas + 550 sponsors) | 18,472 |
| `getChamberDeepBreakdown` (house) | 1 | 12,005 |
| `getChamberDeepBreakdown` (senate) | 1 | 6,467 |
| **Total** | **~587** | **92,559** |

That is roughly a 160× reduction, but the number that matters is not the ratio — it is that
the precomputed cost is **bounded**. It grows with the number of sponsors (~550, fixed by
the size of Congress), not with the number of bills.

This is not hypothetical tuning. Convex caps a single query or mutation at **16 MiB of data
read, 32,000 documents scanned and 16,000 documents written**. A whole-Congress scan is
18,472 bill documents — comfortably over the byte cap and well within striking distance of
the scan cap, with no headroom for growth. Two incidents are recorded in the code:

- An earlier policy-area rollup used `.take(10000)` inside a transaction and **undercounted
  the 119th by roughly 10×**.
- A cross-table policy-area intersection matched the oldest 2,000 subject rows against the
  newest 1,200 bills and **silently returned 0 of 2,070 real "Health" matches**. That is why
  `bills.policyAreaName` is denormalised, and why the recompute counts the same field the
  `/bills` filter reads.

Both failures were silent and returned plausible numbers. That is the reason for the rule
below, not performance.

> **Never aggregate inside a mutation or a query.** Aggregate in an `internalAction`, which
> has no per-transaction document limit, paginating at 2,000 documents a page — then hand the
> finished result to one mutation that writes it atomically.

### When each recompute runs

| Trigger | What it refreshes |
| --- | --- |
| Cron `daily-recompute-stats`, 04:00 UTC | `congressStats` for every Congress with bills, then both chamber breakdowns. **Not** policy areas or sponsors. |
| A sync batch finishing the last page of a (Congress, bill type) | Stats, policy areas, sponsors, and that chamber's breakdown. In practice this fires nightly, off `daily-incremental-sync` (01:00 UTC), and weekly off `weekly-full-sync` (Sun 02:00 UTC) — both of which only touch the **current** Congress |
| `reconcileMissingBills` completing a Congress | Stats, policy areas, sponsors, both chamber breakdowns |
| `npx convex run --prod congressApi:triggerRecomputeStats '{}'` | Wraps `recomputeAllStats` |

> `convex/congressApi.ts` still contains a legacy `dailySync` entry point whose comment points
> at this file. It is wired to no cron and simply delegates to `incrementalSync`; the real
> nightly entry point is `incrementalSync`.

`recomputeAllStats` discovers which Congresses have data by probing
`bills.hasBillsForCongress` for c = 93 … `max(120, currentCongress)` — 28 tiny indexed
queries. The floor of 120 exists so a newly seated Congress is never silently dropped.

Chamber recomputes are kept **sequential, never `Promise.all`** — each paginates 6–7k bills.

Freshness: stats and chamber breakdowns are at most ~24h stale, refreshed by their own cron.
Policy areas and sponsors ride on the nightly incremental sync **completing its last page** —
there is no rollup cron that refreshes them independently, so a failed or partial sync leaves
them stale with nothing to catch it, and closed Congresses only refresh when a sync or
reconcile happens to touch them.

---

## Drill-down

One chokepoint, `handleDrillDown`, which fires the analytics event, pins the Congress, adds
exactly one more filter, and pushes to `/bills`. (The hero's plain "Or browse all bills →"
link and the podcast links navigate on their own and are captured separately.)

**Policy-area rows are the one exception, deliberately.** They are real `<a href>` elements
rather than scripted pushes, because this is the only page search engines index and a
`router.push` passes no link equity to the topic hub pages at all. They fire
`dashboard_drilldown_clicked` themselves, with identical properties, and let the `href` do the
navigating — so the event still cannot be bypassed, but it now has two call sites rather than
one. If you add a new chart, route it through `handleDrillDown`.

| Element | Filter | Example URL |
| --- | --- | --- |
| "Bills introduced" card | `congress` | `/bills?congress=119` |
| "Became law" card | `status=100` | `/bills?congress=119&status=100` |
| Status segment or legend row | `status` | `/bills?congress=119&status=40` |
| Policy area row | `policyArea` | Newest Congress: `/bills/topic/health` (the hub). Older: `/bills?congress=117&policyArea=Health` |
| Sponsor row | `sponsor` | `/bills?congress=119&sponsor=Rick+Scott` |
| Top-state row | `state` | `/bills?congress=119&state=CA` |

### Why the House and Senate cards are not clickable

Verbatim from the source: *"House bills" / "Senate bills" count ALL house-originated (hr,
hjres, hconres, hres) and senate-originated types. There is no single `billType` filter value
that matches that union, so we omit drill-downs on those two cards rather than mislead the
user with a narrower filter.*

Mechanically the two cards simply omit `onClick`, and the card renders a `<div>` with
`cursor-default` instead of a `<button>`, so they get no hover affordance either.

Worth revisiting: `/bills/house` and `/bills/senate` hub pages now exist and carry exactly
the right filter, so a correct target is available today — the cards just do not use it.

---

## Known gaps

Recorded so they are decisions rather than surprises.

1. **~550 sponsor rows are read to render 10.** `getCongressDashboard` collects then slices.
   The `by_congress_and_count` index that would make this `.order('desc').take(10)` exists and
   is used by the answer engine, but not here.
2. **"Top" ordering is an artifact of insertion order.** Neither top list applies an
   `order()`. A future writer that inserted unsorted rows would produce a silently wrong
   "top 10" with no error.
3. **Two policy areas are fetched and discarded** on every load — the query returns 10 and the
   list renders 8.
4. **The monthly chart has no drill-through** — it is the only data section with neither a
   click target nor a link.
5. **Policy areas and sponsors have no independent refresh** — they only update when a sync
   or reconcile completes its last page (see the recompute table above).
6. **`getAllCongressOverview` is never skipped**, so a websocket subscription opens on every
   cold load even though the server-rendered payload already contains the answer.
7. **Nothing tests the dashboard itself.** No test renders `DashboardClient` or exercises
   `getCongressDashboard` / `getChamberDeepBreakdown`. The pure modules underneath *are*
   tested — `convex/billStage.test.ts` for the stage constants,
   `lib/starter-questions.test.ts` for the hero starters — but the rendering and the query
   shapes are not.

---

## Adding a new precomputed metric

Worked example: *median days from introduction to first committee action, per Congress and
chamber.*

**1. Add the table** to `convex/schema.ts`, beside the other `congress*` tables. Prefer arrays
over records for anything with untrusted keys, and always store `updatedAt`.

```ts
congressTimeToCommittee: defineTable({
  congress: v.number(),
  chamber: v.union(v.literal("house"), v.literal("senate")),
  medianDays: v.number(),
  sampleSize: v.number(),
  updatedAt: v.string(),
}).index("by_congress_and_chamber", ["congress", "chamber"]),
```

**2. Add the atomic writer** to `convex/mutations.ts` as an `internalMutation`, patch-or-insert
against the index — copy the shape of `writeCongressChamberBreakdown`. Set `updatedAt` inside
the mutation, not in the caller.

> `mutations.ts` imports `internalMutation` from `./functions` (the trigger-wrapped version
> that keeps the `billsByStage` and `billsByChamber` aggregates in sync) and
> `internalAction` / `internalQuery` from `./_generated/server`. Using the wrong import is how
> an aggregate silently drifts from the table.

**3. Reuse an existing paginated reader.** `getBillsPageByCongress` paginates a whole Congress;
`getChamberBillsPage` paginates one (Congress, bill type). Only add a new `internalQuery` if
you need a different index or projection.

**4. Add the `internalAction` that aggregates.** Page size 2,000; loop with `for (;;)` and
break on `isDone`; annotate the page result with an explicit type alias — the codebase
declares `StatsBillPageResult`, `BillPageResult` and `ChamberBillPageResult` for exactly this
— to avoid circular-inference errors.

```ts
export const recomputeCongressTimeToCommittee = internalAction({
  args: { congress: v.number(), chamber: v.union(v.literal("house"), v.literal("senate")) },
  handler: async (ctx, args) => {
    const billTypes = args.chamber === "house" ? HOUSE_BILL_TYPES : SENATE_BILL_TYPES;
    for (const billType of billTypes) {
      let cursor: string | null = null;
      for (;;) {
        const page: ChamberBillPageResult = await ctx.runQuery(
          internal.mutations.getChamberBillsPage,
          { congress: args.congress, billType, cursor, numItems: 2000 },
        );
        for (const bill of page.page) { /* accumulate */ }
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }
    await ctx.runMutation(internal.mutations.writeCongressTimeToCommittee, { /* … */ });
  },
});
```

Any real arithmetic belongs in its own unit-tested module, the way `convex/baseRates.ts` backs
the committee base rates and `convex/billStage.ts` backs stage derivation. That is what makes
the numbers testable without a database.

**5. Wire it into the schedule** — both places, or say in the PR which you are skipping:
post-sync (the `syncBillBatch` and `reconcileMissingBills` completion branches in
`congressApi.ts`) and nightly (`recomputeAllStats`). If it is expensive and historical data
barely moves, give it its own weekly cron instead, the way `weekly-committee-base-rates` does.

**6. Add the public read query** in `convex/bills.ts`: a single indexed row, and **always
return a zero-filled shape rather than `null`** when the row is missing, so a fresh deploy
renders an empty chart instead of crashing. Copy `getChamberDeepBreakdown`.

**7. Update the docs and analytics.** A new dashboard section needs its events registered in
[`ANALYTICS.md`](ANALYTICS.md) and helpers in `lib/analytics.ts` in the same commit, and this
file and the README updated if what a reader sees has changed.

---

## Performance rules

| Pattern | Verdict |
| --- | --- |
| Single indexed row lookup | Fine |
| Small collection (`congressStats`, 3 rows) | Fine |
| `.take(n)` on an indexed range with a bounded `n` | Careful — know what happens when the cap binds |
| `.collect()` on a per-Congress table (~550 rows) | Tolerated on the dashboard today; index and `.take()` is better |
| `.collect()` on `bills` | Never — 18,472 documents blows the 16 MiB read cap and approaches the 32,000-document scan cap |
| Aggregating inside a mutation or query | Never — use an `internalAction` and paginate |
| Cross-table intersection to filter bills | Never — this is the bug that returned 0 of 2,070 Health matches. Denormalise instead |
