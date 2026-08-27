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

This site tracks user behavior with PostHog. **`ANALYTICS.md` is the registry of
every event we send** and `lib/analytics.ts` is its code counterpart (typed helpers).

These rules apply to EVERY change that adds, removes, or modifies a user-facing feature:

1. **Adding a feature?** In the same commit you must:
   - register its event(s) in the table in `ANALYTICS.md`,
   - add typed helper(s) to `lib/analytics.ts`,
   - call the helper(s) from the new feature code.
2. **Removing a feature?** In the same commit you must:
   - delete its helpers from `lib/analytics.ts` and all call sites,
   - move its rows in `ANALYTICS.md` to the "Retired events" section (with date).
3. **Changing a feature's UX/flow?** Re-check that its events still describe reality;
   update `ANALYTICS.md` + helpers if not.
4. Never call `posthog.capture()` with raw event-name strings in components — always go
   through `lib/analytics.ts`. Never rename existing events casually (it breaks saved
   insights/funnels in PostHog).
5. Server-side events (API routes) use `lib/posthog-server.ts` and must pass the
   browser's distinct-id headers (see `bill_chat_message_processed` for the pattern).

A feature change without its analytics change is an incomplete change — do not consider
the work done, and do not say it's done, until both halves are in place.
