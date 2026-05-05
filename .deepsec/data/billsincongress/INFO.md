# billsincongress

## What this codebase does

Public-facing Next.js 16 (App Router, React 19, Cache Components/PPR) site for browsing every U.S. bill in the current Congress and the two before it. Backend is **Convex Cloud** (`industrious-llama-331.convex.cloud`). Data is pulled from the official **Congress.gov API** by scheduled Convex actions and AI plain-English chat is served via **Groq Compound Mini**. Most pages are anonymous-readable; sign-in (Google OAuth or email + password OTP) only raises the chat quota. Local development talks to the production Convex deployment — there is no dev DB.

## Auth shape

- **Library:** `@convex-dev/auth` configured in `convex/auth.ts`. Providers: `Google` and `Password` (scrypt + `ResendOTP` for email verify, `ResendOTPPasswordReset` for reset).
- **Identity helper:** `getAuthUserId(ctx)` from `@convex-dev/auth/server` — canonical "who is calling?" check in queries and mutations. Returning `null` means anonymous.
- **OAuth redirect allow-list:** `isAllowedRedirect(url)` in `convex/auth.ts`. Prod: `billsincongress.com` / `www.billsincongress.com` (HTTPS). Dev: `localhost:3000` / `127.0.0.1:3000` (HTTP). Any redirect target outside this set must be rejected.
- **Sessions:** 60-day `totalDurationMs` and `inactiveDurationMs`. Cookie `maxAge` in `proxy.ts` must match the same constant.
- **HTTP routes:** `auth.addHttpRoutes(http)` in `convex/http.ts` mounts `/api/auth/*` (powers the Next.js middleware/proxy).

## Threat model

1. **AI-cost abuse via chat** — only paid surface. Mitigated by `chatAnonPerDay` (5/day, keyed on browser sessionId) and `chatAuthedPerDay` (100/day, keyed on userId) in `convex/rateLimits.ts`.
2. **Account takeover via OAuth open-redirect or OTP email bombing.** Mitigations: `isAllowedRedirect` and `otpRequestPerEmail` (5/hour/email) on the send side.
3. **Prompt injection / model steering** through Congress.gov-sourced fields interpolated into the system prompt by `buildSystemPrompt(bill)` in `convex/llm.ts`.
4. **Direct production data exposure.** Local dev hits prod Convex; any mutation runs against the live ~38k-bill dataset and live user table.

## Project-specific patterns to flag

- **Public `mutation` without an auth gate.** Almost all writes are `internalMutation` (scheduled-job-only). A `mutation({ ... })` exported from `convex/` that doesn't call `getAuthUserId(ctx)` and check it is non-null before writing is a regression — flag it.
- **Unindexed table scans on prod data.** `ctx.db.query("bills").collect()` (or any `.collect()` on `billActions`, `billSubjects`, `billText`, `billSummaries` without a narrowing `.withIndex(...)`) will time out and is effectively a DoS lever against the prod DB. Flag any new `.collect()` over those tables that isn't preceded by a narrowing index.
- **Client-supplied `sessionId` used as a rate-limit key.** Anonymous chat quota in `convex/rateLimits.ts` and the chat send path key on a `sessionId: v.string()` argument from the client. If that string isn't bound to anything server-side (cookie, IP, fingerprint), an attacker can rotate it to bypass the 5/day anon cap. Flag any path where `sessionId` is trusted without a server-side binding.
- **User chat input flowing into system-role content.** `buildSystemPrompt(bill)` already interpolates Congress.gov-sourced strings into the system prompt; that's accepted. Flag any code path that takes user-typed chat content and injects it into `system` role rather than `user` role on the Groq request.
- **OAuth `redirectTo` parsing outside `isAllowedRedirect`.** Any new place that accepts an external URL as a redirect target without going through that helper is a regression.

## Known false-positives

- **`convex/http.ts` — `/stripe/webhook` returns 200 with no signature verification.** Explicit in-source stub ("PR 2 implements"). Any "missing Stripe signature verification" or "unauthenticated webhook" finding here is expected — do not raise.
- **`CONVEX_DEPLOYMENT=prod:industrious-llama-331` in `.env.local` examples** and `npx convex run --prod ... deleteCongress` in `README.md` are intentional. The repo deliberately uses production Convex for local dev (cost trade-off documented in README). Don't flag "dev points at prod creds" or "destructive admin command in docs".
- **Outbound `fetch` to `api.congress.gov` and `api.groq.com/openai/v1/chat/completions`** in `convex/congressApi.ts`, `convex/sync.ts`, and `convex/llm.ts` is the core of the app, not SSRF — destinations are constants, not user-controlled.
- **Sponsor/bill data interpolated into the AI system prompt** in `buildSystemPrompt`. Source is upstream Congress.gov (treated as trusted). Don't raise "untrusted input in system prompt" for this code path.
- **`SESSION_DURATION_MS = 60 days`** and `inactiveDurationMs === totalDurationMs` are deliberate — explicit "set it and forget it" UX choice for a low-risk public bills tracker, called out in `convex/auth.ts`.
