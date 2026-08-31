<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

# Product analytics (PostHog) — mandatory for every feature change

This site tracks user behavior with PostHog. **`Documentation/ANALYTICS.md` is the registry of
every event we send** and `lib/analytics.ts` is its code counterpart (typed helpers).

These rules apply to EVERY change that adds, removes, or modifies a user-facing feature:

1. **Adding a feature?** In the same commit you must:
   - register its event(s) in the table in `Documentation/ANALYTICS.md`,
   - add typed helper(s) to `lib/analytics.ts`,
   - call the helper(s) from the new feature code.
2. **Removing a feature?** In the same commit you must:
   - delete its helpers from `lib/analytics.ts` and all call sites,
   - move its rows in `Documentation/ANALYTICS.md` to the "Retired events" section (with date).
3. **Changing a feature's UX/flow?** Re-check that its events still describe reality;
   update `Documentation/ANALYTICS.md` + helpers if not.
4. Never call `posthog.capture()` with raw event-name strings in components — always go
   through `lib/analytics.ts`. Never rename existing events casually (it breaks saved
   insights/funnels in PostHog).
5. Server-side events (API routes) use `lib/posthog-server.ts` and must pass the
   browser's distinct-id headers (`x-posthog-distinct-id`, `x-posthog-session-id`, both
   exported from that file) via `analytics.requestHeaders()` on the client fetch.
   Note there is currently **no live server-side event**: the one example in the registry,
   `bill_chat_message_processed`, fires from `app/api/bill-chat/send/route.ts`, which no
   part of the UI calls any more. Read it as a reference implementation, not as something
   that runs. The live answer path (`app/api/answer/route.ts`) sends no server event and
   does not forward the headers.

A feature change without its analytics change is an incomplete change — do not consider
the work done, and do not say it's done, until both halves are in place.

# Documentation — mandatory for every feature change

The same rule applies to prose. **Any time a feature is built, and any time anything is
deleted**, re-read `README.md` and every file in `Documentation/` and update whatever no
longer matches — not only the section you touched.

- `README.md` is written for the public: what the site does, where the data comes from, and
  the disclosures (AI use, tracking, accounts, accuracy limits, independence).
- `Documentation/overview.md` is the architecture and operations reference.
- `Documentation/interactive-dashboard.md` covers the home-page dashboard and the
  precomputed-analytics pattern.
- `Documentation/ANALYTICS.md` is the event registry described above.

This repository is public, and its value rests on a reader being able to verify how it
works. Documentation describing a version of the site that no longer exists is worse than
none: it misleads the next reader and makes the project look untrustworthy. The README has
already drifted badly once, claiming AI wrote the bill summaries (the government does) and
documenting four cron jobs when there were nine.

Treat "docs updated" as an acceptance criterion, in the same commit as the code. Before
saying the work is done, state explicitly what you updated — or that you checked and nothing
needed updating.

# Answer accuracy — mandatory for anything touching `convex/catalog/` or `convex/answer.ts`

This site's whole value is that its facts are right. An audit on 2026-08-30 found 41 confirmed
defects where the assistant stated something false, with citations, in the site's own voice —
"104 House bills became law" (it is 64), "we don't have data on Texas bills that became law"
(eleven had), members with two-word surnames reported as having introduced nothing.

Every one was the same mistake: we handed the model a **page** and let it answer a question about
a **set**.

Three rules, in order of importance:

1. **Read `convex/catalog/completeness.ts` before changing any fetch handler.** A handler must
   declare the set its rows came from, whether it read all of it, and in what order. A `total` is
   emitted ONLY when the read was complete. Never add a field that reports a number derived from
   a capped scan — the absence of a number is the entire mechanism.
2. **Never claim an order you cannot guarantee.** `order: "arbitrary"` is the honest default.
   A sort is only real when an index provides it or the whole set was read.
3. **Prove it against real data, not a fixture.** `scripts/truth/handlers.test.ts` runs the real
   handlers against a local copy of production via `scripts/truth/fakedb.ts`. Every accuracy fix
   needs a case there, written as the wrong answer a reader actually got.

   **These tests do not run in CI**, because the production copy is not committed. `pnpm test`
   reports them as `SKIPPED` and prints what did not run — a green CI check is NOT evidence the
   answer engine was checked. Before merging anything under `convex/catalog/` or
   `convex/answer.ts`, run the gate locally:

   ```bash
   export $(grep -E '^CONVEX_DEPLOY_KEY=' <main-checkout>/.env | xargs)
   ./node_modules/.bin/tsx scripts/truth/dump.ts   # read-only; keeps only public tables
   REQUIRE_TRUTH_CACHE=1 pnpm test                 # turns the skips into failures
   ```

   `REQUIRE_TRUTH_CACHE=1` is the difference between "the tests passed" and "the tests ran".

When a wrong answer is found in the wild, add it to `scripts/truth/questions.ts` FIRST, watch it
go red, then fix it.

**Deploying `convex/` is manual and merging does not do it.** See "Deploying Convex" in
`Documentation/overview.md`. Production once ran three days behind `main` here and answered
bill-page questions about the wrong bill for the duration.
