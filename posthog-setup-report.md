# PostHog integration report — Bills in Congress

Generated for Self-driving / scout context. Project **BillsInCongress** (id `451900`, US Cloud).

## SDK integration

| Item | Status |
|------|--------|
| Framework | Next.js App Router |
| Client init | `instrumentation-client.ts` — single `posthog.init()` site |
| Client helpers | `lib/analytics.ts` — all custom events |
| Server client | `lib/posthog-server.ts` — API routes only |
| Auth sync | `components/analytics/posthog-auth-sync.tsx` |
| Reverse proxy | `https://t.billsincongress.com` (managed, DNS-only CNAME) |
| Error tracking | `capture_exceptions: true` + `lib/error-filter.ts` before_send |
| Event registry | `Documentation/ANALYTICS.md` (contract test: `lib/analytics-contract.test.ts`) |

## Custom events

- **~50 live custom events** in `lib/analytics.ts`, all registered in `Documentation/ANALYTICS.md`.
- No raw `posthog.capture()` in components — only inside `lib/analytics.ts`.
- Primary surfaces: bill browse/filters, bill detail, grounded answer panel, auth, Learn page, podcast promos.

## Autocapture (project settings, not in repo)

- `$pageview`, `$autocapture`, session replay, web vitals, heatmaps enabled in PostHog UI.
- Session replay: 30-day retention, 100% sample rate, input values masked.

## Server-side gaps

- Live answer path (`/api/answer`) has **no** server event and does not forward PostHog identity headers.
- Dead route `bill_chat_message_processed` still exists on `/api/bill-chat/send` (no UI caller).

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
