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
- `Documentation/brand.md` is the design language — see the next section.

This repository is public, and its value rests on a reader being able to verify how it
works. Documentation describing a version of the site that no longer exists is worse than
none: it misleads the next reader and makes the project look untrustworthy. The README has
already drifted badly once, claiming AI wrote the bill summaries (the government does) and
documenting four cron jobs when there were nine.

Treat "docs updated" as an acceptance criterion, in the same commit as the code. Before
saying the work is done, state explicitly what you updated — or that you checked and nothing
needed updating.

# Design — mandatory for anything a reader sees

**`Documentation/brand.md` is the source of truth for how the site looks and reads**: the
principles, voice, colour tokens, type scale, layout, components, charts, logo and icons.
Everything visual is downstream of it:

- colours and themes live in `app/globals.css` as tokens, exposed by `tailwind.config.ts` as
  classes named the same way (`bg-paper`, `text-ink-2`, `border-line-strong`, `bg-status-law`);
- the logo and the shared pieces (stage pill and track, party tag, section header, source
  line) live in `components/brand/`; the primitives in `components/ui/`.

Rules:

1. Build from those tokens and components. A colour literal in a component is a bug (chart
   code reading `var(--topic-n)` / `hsl(var(--party-x))` is the one exception).
2. **Colour belongs to the data.** The chrome is ink on paper; a hue only ever encodes a
   topic, a party or a stage. There is no accent colour — do not add one. Party colours
   appear only where the data is about party.
3. Changing the design means changing `Documentation/brand.md` first, then the code, in the
   same commit.
4. Check every visual change in both themes (Day and Night) and at phone (390px) and desktop
   (1440px) widths before calling it done.

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

   No deploy key? After `npx convex login`, run `dump.ts --deployment prod` instead (or the
   production deployment's name in a checkout not linked to the project; `dump.ts` refuses any
   deployment that is not production).

   `REQUIRE_TRUTH_CACHE=1` is the difference between "the tests passed" and "the tests ran".

When a wrong answer is found in the wild, add it to `scripts/truth/questions.ts` FIRST, watch it
go red, then fix it.

**Deploying `convex/` is manual and merging does not do it.** See "Deploying Convex" in
`Documentation/overview.md`. In a checkout not linked to the project, target production
explicitly: `CONVEX_DEPLOYMENT=prod:industrious-llama-331 npx convex deploy` (dry-run it first
with `--dry-run`). Production once ran three days behind `main` here and answered
bill-page questions about the wrong bill for the duration.

<posthog>
## PostHog

Use `posthog-cli api` for all PostHog-related data queries and operations. You should use `posthog-cli api` over direct MCP tool calls whenever the CLI is available.

Before your first PostHog command in a session, run `posthog-cli api --agent-help` and load its full output into your context. It prints the complete agent guide — command reference, schema drill-down rules, data discovery workflow, and the tool index — for interacting with PostHog APIs. Treat that output as instructions to follow, not just documentation.

Before starting a PostHog task, run `posthog-cli api skill list` and check for a skill matching the task. If one matches, install it with `posthog-cli api skill install <skill-id>` (add `--force` to refresh an already-installed skill), then read `.agents/skills/<skill-id>/SKILL.md` and follow it. Skills contain task-specific workflows that individual tools do not.

## PostHog Self-driving

Self-driving watches production signals and opens GitHub PRs. Nothing merges automatically.

- **Setup:** `posthog-cli login` then `pnpm posthog:self-driving` (project id `451900`).
- **Billing:** Inbox product billing limit is **$0** — first 3 PRs/month free, no paid PRs.
- **Integration report:** `posthog-setup-report.md` describes what is instrumented.
- **Session replay** reaches the inbox via Replay Vision scanners, not scouts.

**Rules for any Self-driving PR that touches analytics** (human or agent):

1. Follow the analytics contract above — registry + `lib/analytics.ts` helper + call site in one PR.
2. Never rename events. Never add raw `posthog.capture()` outside `lib/analytics.ts`.
3. Do not change `lib/error-filter.ts` without updating `lib/error-filter.test.ts`.
4. Do not touch `convex/catalog/` or `convex/answer.ts` without `scripts/truth/` cases.
5. Self-driving uses PostHog's AI — you cannot substitute your own Claude subscription.
</posthog>

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
