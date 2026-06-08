import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily at 1:00 AM UTC - incremental sync (only recently updated bills)
crons.daily(
  "daily-incremental-sync",
  { hourUTC: 1, minuteUTC: 0 },
  internal.congressApi.incrementalSync,
);

// Run weekly on Sunday at 2:00 AM UTC - full 7-day sync (safety net)
crons.weekly(
  "weekly-full-sync",
  { dayOfWeek: "sunday", hourUTC: 2, minuteUTC: 0 },
  internal.congressApi.fullSync,
);

// Run weekly on Wednesday at 3:00 AM UTC - repair incomplete bills
crons.weekly(
  "weekly-repair-incomplete",
  { dayOfWeek: "wednesday", hourUTC: 3, minuteUTC: 0 },
  internal.congressApi.repairIncompleteBills,
  {},
);

// Run daily at 4:00 AM UTC - recompute homepage stats (safety net after syncs)
crons.daily(
  "daily-recompute-stats",
  { hourUTC: 4, minuteUTC: 0 },
  internal.congressApi.recomputeAllStats,
  {},
);

// Run monthly on the 1st at 5:00 AM UTC - full re-pull of the current congress.
// The most reliable freshness mechanism: re-derives stage + latestActionDate,
// refreshes enrichment, inserts missing bills, and corrects present-but-stale
// bills (closed congresses are final, so only the current one needs this).
crons.cron(
  "monthly-current-congress-repull",
  "0 5 1 * *",
  internal.congressApi.monthlyCurrentCongressRepull,
  {},
);

// Run weekly on Monday at 6:00 AM UTC - completeness reconciliation across the
// current + 2 most recent congresses. Inserts never-synced bills the bounded
// daily/weekly lookback windows can't discover.
crons.cron(
  "weekly-reconcile-recent-congresses",
  "0 6 * * 1",
  internal.congressApi.reconcileRecentCongresses,
  {},
);

export default crons;
