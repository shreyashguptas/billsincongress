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

export default crons;
