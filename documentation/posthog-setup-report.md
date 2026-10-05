# PostHog integration report — Bills in Congress

Generated for Self-driving / scout context. Project **BillsInCongress** (id `451900`, US Cloud).

## SDK integration

| Item | Status |
|------|--------|
| Framework | Next.js App Router |
| Client init | `instrumentation-client.ts` — single `posthog.init()` site |
| Client helpers | `lib/analytics.ts` — all custom events |
| Server client | `lib/posthog-server.ts` — `$exception` from three API routes only (`captureServerException`) |
| Auth sync | `components/analytics/posthog-auth-sync.tsx` |
| Reverse proxy | `https://t.billsincongress.com` (managed, DNS-only CNAME) |
| Error tracking | `capture_exceptions: true` + `lib/error-filter.ts` before_send |
| Event registry | [`analytics.md`](analytics.md) (contract test: `lib/analytics-contract.test.ts`) |

## Custom events

- **94 live custom events** in `lib/analytics.ts`, all registered in [`analytics.md`](analytics.md).
- No raw `posthog.capture()` in components — only inside `lib/analytics.ts`.
- Primary surfaces: bill browse/filters, bill detail, grounded answer panel, auth, Learn page, podcast promos, and the Pro plan (bill alerts, Stripe checkout, billing portal).
- Pro funnel: `bill_alert_upsell_shown` / `rate_limit_upgrade_clicked` → `pro_checkout_started` → `pro_checkout_returned` → `pro_activated`.

## Autocapture (project settings, not in repo)

- `$pageview`, `$autocapture`, session replay, web vitals, heatmaps enabled in PostHog UI.
- Session replay: 30-day retention, 100% sample rate, input values masked.

## Server-side gaps

- Live answer path (`/api/answer`) forwards the PostHog identity headers to Convex, which records each answer as PostHog AI trace events (`convex/aiTrace.ts`; "AI traces" in [`analytics.md`](analytics.md#ai-traces-every-answer-from-convex)) and sends one PostHog Logs line per answer (`convex/posthogLogs.ts`; ["PostHog Logs"](analytics.md#posthog-logs) in the same file). Both have been live since 30 Sep 2026. It has no `posthog-node` event.
- No API route sends a product event. The old per-bill chat route (`/api/bill-chat/send`, the only source of `bill_chat_message_processed`) was deleted on 1 Oct 2026.

## AI observability

| Item | Status |
|------|--------|
| Prompt management | `answer-system` (v1 = prompt live through 2026-10-05, v2 = rewrite, label `production` → v2). Served by `convex/answerPrompts.ts` once `POSTHOG_PERSONAL_API_KEY` is set; see "Answer prompt" in [`overview.md`](overview.md) |
| Evaluations | Hog, live: "Answer uses internal jargon", "Answer shows raw tags", "Answer shows its thinking". LLM judge, off until a provider key is added: "Answer states only what the lookups support" |
| Clusters | Default trace, generation and evaluation jobs enabled; no runs yet at ~140 traces a week |

## Self-driving configuration (target state)

| Setting | Value |
|---------|-------|
| Signal sources | health_checks, error_tracking (×3), conversations/ticket |
| Session replay route | Replay Vision scanners (not session_analysis_cluster) |
| Scouts enabled | general, product-analytics, web-analytics, health-checks |
| Scouts disabled | error-tracking, session-replay (routed elsewhere), all others |
| Billing | Inbox limit **$0** — 3 free PRs/month, no paid PRs |
| GitHub | `shreyashguptas/billsincongress` |

Run `pnpm posthog:self-driving` after `posthog-cli login` to apply API-side configuration.
