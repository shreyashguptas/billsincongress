import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { internalMutation } from "./functions";
import { billsByChamber, billsByStage } from "./aggregates";

const BACKFILL_BATCH_SIZE = 50;

/**
 * Backfills the bill aggregates from the existing `bills` table. Run once
 * after deploying the aggregate components, or the aggregate-backed public
 * bill filters have no data. Idempotent (`insertIfDoesNotExist`).
 *
 *     npx convex run --prod aggregateBackfill:run '{}'
 *     # lower the batch size if you see transaction-limit errors in the logs:
 *     npx convex run --prod aggregateBackfill:run '{"batchSize": 25}'
 *
 * Each batch self-schedules the next so no single mutation exceeds Convex's
 * per-transaction document limits; the final batch recomputes every
 * congressStats row. 50 bills/batch is sized for that: each bill runs two
 * nested aggregate mutations, each writing a handful of btree nodes.
 */
export const run = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ started: true; batchSize: number }> => {
    const batchSize = args.batchSize ?? BACKFILL_BATCH_SIZE;
    console.log(
      `Starting aggregate backfill from null cursor (batchSize=${batchSize})`,
    );
    await ctx.scheduler.runAfter(
      0,
      internal.aggregateBackfill.backfillBatch,
      { cursor: null, batchSize },
    );
    return { started: true, batchSize };
  },
});

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
      // Idempotent: a sync between batches may already have inserted the doc.
      await billsByChamber.insertIfDoesNotExist(ctx, bill);
      await billsByStage.insertIfDoesNotExist(ctx, bill);
    }

    console.log(
      `Backfilled ${result.page.length} bills (isDone=${result.isDone})`,
    );

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

export const recomputeAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ congresses: number[] }> => {
    const congresses: number[] = await ctx.runQuery(
      internal.aggregateBackfill.distinctCongresses,
      {},
    );
    for (const congress of congresses) {
      await ctx.runAction(internal.mutations.recomputeCongressStats, {
        congress,
      });
    }
    console.log(
      `Recomputed congressStats for: ${congresses.join(", ") || "(none)"}`,
    );
    return { congresses };
  },
});

// Probes a fixed congress range rather than scanning the bills table — sync
// only ever writes congresses 93-120.
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
 * the backfill so aggregate-backed filter counts stay available.
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

/**
 * Diagnostics. `countsByType` gives per-bill-type counts for one congress (use
 * when chamber totals don't match Congress.gov); `status` below compares the
 * aggregate counts against a direct bills-table probe.
 *
 *     npx convex run --prod aggregateBackfill:countsByType '{"congress": 119}'
 *     npx convex run --prod aggregateBackfill:status '{}'
 *
 * Both are internalQuery on purpose. They are operator tools with no caller in
 * the app, and `status` alone reads several thousand documents per call — as
 * public queries they were an unauthenticated read-burn door for anyone holding
 * the deployment URL, which is exactly why `policyAreaBackfill.status` is
 * internal. `npx convex run` calls internal functions as admin, so the CLI
 * usage above is unaffected.
 */
export const countsByType = internalQuery({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const ns = { namespace: args.congress };
    const types = ["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"];
    const bounds = types.map((t) => ({ ...ns, bounds: { eq: t } as const }));
    const counts = await billsByChamber.countBatch(ctx, bounds);
    return types.map((t, i) => ({ type: t, count: counts[i] ?? 0 }));
  },
});

export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const congresses = [117, 118, 119];
    const out = [] as Array<{
      congress: number;
      aggregateTotal: number;
      aggregateHouse: number;
      aggregateSenate: number;
      billsProbe1k: number;
    }>;
    for (const congress of congresses) {
      const ns = { namespace: congress };
      const [house, senate] = await billsByChamber.countBatch(ctx, [
        {
          ...ns,
          bounds: {
            lower: { key: "h", inclusive: true },
            upper: { key: "i", inclusive: false },
          },
        },
        {
          ...ns,
          bounds: {
            lower: { key: "s", inclusive: true },
            upper: { key: "t", inclusive: false },
          },
        },
      ]);
      const probe = await ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", congress))
        .take(1000);
      out.push({
        congress,
        aggregateTotal: house + senate,
        aggregateHouse: house,
        aggregateSenate: senate,
        billsProbe1k: probe.length,
      });
    }
    return out;
  },
});
