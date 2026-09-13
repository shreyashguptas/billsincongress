# PostHog Self-driving setup report

## Summary

PostHog Self-driving is configured for Bills in Congress. Session Replay and Error Tracking were already enabled; Support was enabled in this run. Native health, error, and support signal sources are on, GitHub Issues is syncing, and two Replay Vision monitors now feed corroborated findings to the inbox.

Findings should start appearing in the [Self-driving inbox](https://us.posthog.com/project/451900/inbox) within about 30 minutes.

## AI data processing

Approved by the wizard’s organization-level gate before setup began.

## GitHub

The PostHog GitHub App was already connected. This setup connected the `shreyashguptas/billsincongress` GitHub Issues warehouse source (source id `01a09834-ccab-0000-8cce-faca99375ee1`); its first incremental sync has started. Only the `issues` table is syncing because it is the responder-consumed table.

## Products enabled

| Product | Result | Client check |
| --- | --- | --- |
| Session Replay | Already enabled | Clean: client initialization does not disable recording. |
| Error Tracking | Already enabled | Clean: client initialization enables exception capture. |
| Support (Conversations) | Enabled | Tickets will arrive only after an inbound email, inbox, or Slack channel is connected in PostHog. |

## Signal sources

| Signal source | Action |
| --- | --- |
| `health_checks` / `health_issue` | Enabled |
| `error_tracking` / `issue_created` | Enabled |
| `error_tracking` / `issue_reopened` | Enabled |
| `error_tracking` / `issue_spiking` | Enabled |
| `conversations` / `ticket` | Enabled; idle until an inbound support channel is connected |
| `github` / `issue` | Enabled; warehouse source is running |
| `signals_scout` / `cross_source_issue` | No row created; scout findings are enabled by default |
| `session_replay` / `session_analysis_cluster` | Deliberately skipped; session replay reaches the inbox through Replay Vision scanners |

## Connected tools

| Tool | Outcome |
| --- | --- |
| GitHub Issues | Connected by this setup (source id `01a09834-ccab-0000-8cce-faca99375ee1`, first sync started); responder enabled |
| Linear, Jira, Sentry, Zendesk, and other catalog tools | Not used (not selected) |

## Scout troop

Four built-in scouts are active, each on the server default daily cadence:

| Scout | Status | Reason |
| --- | --- | --- |
| `signals-scout-general` | Enabled | Cross-product correlations and uncovered surfaces |
| `signals-scout-product-analytics` | Enabled | High-volume custom product journeys and saved funnels |
| `signals-scout-web-analytics` | Enabled | Web traffic, attribution, landing-page health, bounces, and 404s |
| `signals-scout-health-checks` | Enabled | PostHog setup and instrumentation health |
| `signals-scout-error-tracking` | Disabled | Covered by the native Error Tracking signal source |
| `signals-scout-session-replay` | Disabled | Covered by the Replay Vision monitors below |
| Remaining 21 built-in scouts | Disabled | Their product surfaces are not currently evidenced or would duplicate the selective baseline |

**Run budget:** 100 runs/day; 0 used today and 100 remaining at setup time. The enrollment banner states that scouts are in early access and requests for more capacity can go to `team-self-driving@posthog.com`.

## Custom scouts

No custom scouts were created. Two focused candidates were proposed for the grounded-answer quality flow and bill-discovery dead ends; the user selected **“None — keep the built-in troop”**, so neither was created.

The grounded-answer candidate would have watched citation loss, increasing fallback use, truncation, and failures together; the built-in product-analytics scout provides broad journey coverage, but not this tailored quality discriminator. The bill-discovery candidate would have watched high-demand no-result clusters and abrupt filter-path changes; broad product analytics covers conversion trends, but not that dedicated empty-result discriminator. If a future custom scout is noisy, set `emit: false` on its config in PostHog to change it to dry-run.

## Replay Vision scanners

A scanner is an LLM that watches individual session recordings on a schedule and pushes what it finds to the inbox. These are the only setup items that spend Replay Vision quota. Scanner findings arrive at half weight and need independent corroboration before promotion into a report.

| Monitor | Result | Scope | Sampling | Estimate |
| --- | --- | --- | --- | --- |
| **Bill discovery and answer breakage** | Created | Recordings that visited `/bills`, covering the bill-browse → bill-detail → grounded-answer journey where visible breakage costs readers the most | 50% | 1,264 observations/month; 6,320 credits/month |
| **Bill research frustration** | Created | Recordings containing `$rageclick` only, without URL narrowing, to catch visible struggle independently | 100% | 43 observations/month; 215 credits/month |

Both monitors are enabled and emit Self-driving findings. Recordings already exist, so they are armed immediately. Scanner spend estimates were returned at creation; organization-level remaining Replay Vision quota could not be verified because the in-product sizing skill was unavailable on this deployment.

## Follow-ups

- [ ] Connect a Support inbound channel (email, inbox, or Slack) in PostHog so the enabled support responder receives tickets.
- [ ] Review early Replay Vision observations and rate them with thumbs up/down in their scanner pages; this produces configuration recommendations for review.
- [ ] Review organization-level Replay Vision quota before expanding scanner scope or adding monitors.

## What happens next

Fresh scout configs are picked up by the coordinator within about 30 minutes and consume the shared daily budget. Findings cluster into reports in the [Self-driving inbox](https://us.posthog.com/project/451900/inbox); immediately actionable reports can begin coding tasks.

## Repository changes

No application instrumentation or configuration files were changed. This report was created as `posthog-self-driving-report.md`.
