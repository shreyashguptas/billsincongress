import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Run daily at 1:00 AM UTC to sync the current congress bills
crons.daily(
  "daily-bill-sync",
  { hourUTC: 1, minuteUTC: 0 },
  internal.congressApi.dailySync,
);

export default crons;
