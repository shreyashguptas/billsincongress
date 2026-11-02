/**
 * What a merge starts by itself, so it ships whole: `.github/workflows/deploy.yml`
 * runs `convex run afterDeploy:run` after the backend and the site are
 * deployed, and the hourly `resume-background-jobs` cron runs it too. Every
 * step does nothing when its work is done or already running, so it runs on
 * every deploy, and a job whose chain died is restarted within the hour.
 *
 * Today:
 * - Members' official accounts: the first sync, then the first check of every
 *   member's official site, instead of waiting for the 07:40 and 08:10 crons.
 * - Cosponsors: the one-time backfill of every stored bill
 *   (`congressApi.backfillCosponsors`), about a day and a half.
 *
 * A step added here must be safe to run on every deploy for ever: check for
 * the finished state first, and start long work through `claimJob`.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";

export const COSPONSORS_BACKFILL = "cosponsors-backfill";

/**
 * A job chain silent this long has died. Its longest planned pause is the
 * 15-minute rate-limit cool-down, and a run lasts at most ten minutes.
 */
export const JOB_STALE_AFTER_MS = 2 * 60 * 60 * 1000;

/**
 * Whether to start `name` now, recording that it started. No when it is done,
 * or when it is running and wrote a heartbeat within JOB_STALE_AFTER_MS.
 */
async function claimJob(ctx: MutationCtx, name: string, now: number): Promise<boolean> {
  const job = await ctx.db
    .query("backgroundJobs")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (job?.state === "done") return false;
  if (job && now - job.heartbeatAt < JOB_STALE_AFTER_MS) return false;
  if (job) {
    await ctx.db.patch(job._id, { heartbeatAt: now });
  } else {
    await ctx.db.insert("backgroundJobs", { name, state: "running", startedAt: now, heartbeatAt: now });
  }
  return true;
}

const outcome = v.union(v.literal("started"), v.literal("running"), v.literal("done"));

export const run = internalMutation({
  args: { now: v.optional(v.number()) },
  returns: v.object({ memberAccounts: outcome, cosponsors: outcome }),
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();

    // An empty table is the first deploy: anything else is the daily crons' to keep.
    let memberAccounts: "started" | "done" = "done";
    if ((await ctx.db.query("memberAccounts").first()) === null) {
      await ctx.scheduler.runAfter(0, internal.memberAccounts.sync, { checkSitesAfter: true });
      memberAccounts = "started";
    }

    const job = await ctx.db
      .query("backgroundJobs")
      .withIndex("by_name", (q) => q.eq("name", COSPONSORS_BACKFILL))
      .unique();
    let cosponsors: "started" | "running" | "done" = job?.state === "done" ? "done" : "running";
    if (await claimJob(ctx, COSPONSORS_BACKFILL, now)) {
      await ctx.scheduler.runAfter(0, internal.congressApi.backfillCosponsors, {});
      cosponsors = "started";
    }

    console.log(`[after deploy] member accounts: ${memberAccounts}; cosponsors backfill: ${cosponsors}`);
    return { memberAccounts, cosponsors };
  },
});

/** Written by every run of a job's chain. */
export const heartbeat = internalMutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db
      .query("backgroundJobs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (job) {
      // A run started by hand after the job finished is a new run of it.
      await ctx.db.patch(job._id, { state: "running", heartbeatAt: now, finishedAt: undefined });
    } else {
      await ctx.db.insert("backgroundJobs", { name: args.name, state: "running", startedAt: now, heartbeatAt: now });
    }
    return null;
  },
});

export const finish = internalMutation({
  args: { name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const job = await ctx.db
      .query("backgroundJobs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (job) {
      await ctx.db.patch(job._id, { state: "done", heartbeatAt: now, finishedAt: now });
    } else {
      await ctx.db.insert("backgroundJobs", { name: args.name, state: "done", startedAt: now, heartbeatAt: now, finishedAt: now });
    }
    return null;
  },
});

/** The Congresses we hold bills for, newest first (one stats row each; a handful). */
export const heldCongresses = internalQuery({
  args: {},
  returns: v.array(v.number()),
  handler: async (ctx) => {
    const stats = await ctx.db.query("congressStats").take(100);
    return [...new Set(stats.map((s) => s.congress))].sort((a, b) => b - a);
  },
});
