import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { internalMutation } from "./functions";
import { billsByChamber, billsByStage } from "./aggregates";

const BACKFILL_BATCH_SIZE = 500;

/**
 * Public action to backfill the bill aggregates from the existing `bills`
 * table. Run this once after deploying the aggregate components — without it
 * the new `recomputeCongressStats` would see empty aggregates.
 *
 * Idempotent: uses `insertIfDoesNotExist` so re-running on already-populated
 * aggregates is safe.
 *
 *     npx convex run --prod aggregateBackfill:run '{}'
 *
 * The action only kicks off the first batch and returns immediately. Each
 * batch self-schedules the next via the scheduler so we never exceed Convex's
 * per-mutation document limit, and the final batch triggers a recompute of
 * every congressStats row.
 */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<{ started: true }> => {
    console.log("Starting aggregate backfill from null cursor");
    await ctx.scheduler.runAfter(
      0,
      internal.aggregateBackfill.backfillBatch,
      { cursor: null },
    );
    return { started: true };
  },
});

/**
 * Process one page of bills and self-schedule the next page.
 */
export const backfillBatch = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = args.batchSize ?? BACKFILL_BATCH_SIZE;
    const result = await ctx.db.query("bills").paginate({
      cursor: args.cursor,
      numItems,
    });

    for (const bill of result.page) {
      // Idempotent so we don't blow up if the aggregate already has the doc
      // (e.g. when a sync ran between batches and the trigger inserted it).
      await billsByChamber.insertIfDoesNotExist(ctx, bill);
      await billsByStage.insertIfDoesNotExist(ctx, bill);
    }

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.aggregateBackfill.backfillBatch,
        { cursor: result.continueCursor, batchSize: numItems },
      );
      return;
    }

    console.log(
      "Aggregate backfill complete — recomputing congressStats for all known congresses",
    );
    await ctx.scheduler.runAfter(
      0,
      internal.aggregateBackfill.recomputeAll,
      {},
    );
  },
});

/**
 * After the backfill finishes, refresh `congressStats` for every congress
 * that has bills so the homepage cache reflects the now-correct aggregate
 * values.
 */
export const recomputeAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ congresses: number[] }> => {
    const congresses: number[] = await ctx.runQuery(
      internal.aggregateBackfill.distinctCongresses,
      {},
    );
    for (const congress of congresses) {
      await ctx.runMutation(internal.mutations.recomputeCongressStats, {
        congress,
      });
    }
    console.log(
      `Recomputed congressStats for: ${congresses.join(", ") || "(none)"}`,
    );
    return { congresses };
  },
});

/**
 * Returns every distinct `congress` that appears in the bills table. Used by
 * the post-backfill recompute step. Probes a fixed range so we don't have to
 * scan the bills table — historical sync only writes congresses 93-120.
 */
export const distinctCongresses = internalQuery({
  args: {},
  handler: async (ctx): Promise<number[]> => {
    const present: number[] = [];
    for (let c = 93; c <= 130; c++) {
      const first = await ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", c))
        .first();
      if (first) present.push(c);
    }
    return present;
  },
});

/**
 * Wipes both bill aggregates. Use only if you intend to immediately re-run
 * the backfill. After clearing, you MUST run `aggregateBackfill:run` before
 * `recomputeCongressStats` runs again, or the precomputed stats will get
 * zeroed out (the recompute has a guard to avoid this, but it relies on the
 * bills table being non-empty).
 *
 *     npx convex run --prod aggregateBackfill:clear '{}'
 */
export const clear = internalAction({
  args: {},
  handler: async (ctx): Promise<{ cleared: true }> => {
    await ctx.runMutation(internal.aggregateBackfill.clearAggregates, {});
    return { cleared: true };
  },
});

export const clearAggregates = internalMutation({
  args: {},
  handler: async (ctx) => {
    await billsByChamber.clearAll(ctx);
    await billsByStage.clearAll(ctx);
  },
});
