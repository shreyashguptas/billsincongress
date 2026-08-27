import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "daily-incremental-sync",
  { hourUTC: 1, minuteUTC: 0 },
  internal.congressApi.incrementalSync,
);

crons.weekly(
  "weekly-full-sync",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.congressApi.fullSync,
);

crons.weekly(
  "weekly-repair-incomplete",
  { dayOfWeek: "wednesday", hourUTC: 3, minuteUTC: 0 },
  internal.congressApi.repairIncompleteBills,
  {},
);

crons.daily(
  "daily-recompute-stats",
  { hourUTC: 4, minuteUTC: 0 },
  internal.congressApi.recomputeAllStats,
  {},
);

// Monthly full re-pull of the current congress: re-derives stage +
// latestActionDate, refreshes enrichment, inserts missing bills and corrects
// stale ones. Closed congresses are final, so only the current one needs it.
crons.cron(
  "monthly-current-congress-repull",
  "0 5 1 * *",
  internal.congressApi.monthlyCurrentCongressRepull,
  {},
);

// Completeness reconciliation across the current + 2 most recent congresses:
// inserts never-synced bills the bounded lookback windows can't discover.
crons.cron(
  "weekly-reconcile-recent-congresses",
  "0 6 * * 1",
  internal.congressApi.reconcileRecentCongresses,
  {},
);

// Committee "base rates" from finished congresses; historical data barely moves.
crons.weekly(
  "weekly-committee-base-rates",
  { dayOfWeek: "friday", hourUTC: 4, minuteUTC: 30 },
  internal.mutations.recomputeCommitteeBaseRates,
  {},
);

// Drain the IndexNow queue twice a day. 01:30 UTC is 30 minutes after the
// incremental sync, so an overnight status change is announced the same morning.
// Two runs of up to 2,000 URLs (~4,000/day) is the pacing that keeps the
// one-time backlog seed from looking like a dump; the seed is never on a cron.
crons.cron(
  "indexnow-submit-morning",
  "30 1 * * *",
  internal.indexNow.submitBatch,
  {},
);

crons.cron(
  "indexnow-submit-evening",
  "30 13 * * *",
  internal.indexNow.submitBatch,
  {},
);

export default crons;
