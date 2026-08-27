import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

/**
 * One-time backfill of `bills.policyAreaName` from the `billSubjects` table, so
 * the topic filter is an indexed lookup instead of an intersection of two capped
 * reads (see the note in convex/schema.ts). Reads only data already in Convex —
 * no Congress.gov API calls.
 *
 *     npx convex run --prod policyAreaBackfill:run '{}'
 *     # smaller batches if the logs show transaction-limit errors:
 *     npx convex run --prod policyAreaBackfill:run '{"batchSize": 100}'
 *
 * Idempotent: a bill whose stored value already matches is skipped. Check
 * progress with `policyAreaBackfill:status`.
 */
const BACKFILL_BATCH_SIZE = 200;

export const run = internalAction({
  args: { batchSize: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ started: true; batchSize: number }> => {
    const batchSize = args.batchSize ?? BACKFILL_BATCH_SIZE;
    console.log(
      `Starting policy-area backfill from null cursor (batchSize=${batchSize})`,
    );
    await ctx.scheduler.runAfter(0, internal.policyAreaBackfill.backfillBatch, {
      cursor: null,
      batchSize,
      patched: 0,
      scanned: 0,
    });
    return { started: true, batchSize };
  },
});

/**
 * Uses the RAW `internalMutation` rather than the trigger-wrapped one from
 * `./functions` on purpose: the bill aggregates key on `billType` and
 * `progressStage`, neither of which this backfill touches, so firing them for
 * ~55,000 bills is pure write amplification with no effect on the counts.
 */
export const backfillBatch = internalMutation({
  args: {
    cursor: v.union(v.string(), v.null()),
    batchSize: v.optional(v.number()),
    patched: v.number(),
    scanned: v.number(),
  },
  handler: async (ctx, args) => {
    const numItems = args.batchSize ?? BACKFILL_BATCH_SIZE;
    const result = await ctx.db.query("bills").paginate({
      cursor: args.cursor,
      numItems,
    });

    let patched = args.patched;
    for (const bill of result.page) {
      const subject = await ctx.db
        .query("billSubjects")
        .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
        .first();
      // No subjects row yet: leave the policy area absent until subjects sync.
      const policyAreaName = subject?.policyAreaName;
      if (policyAreaName !== undefined && bill.policyAreaName !== policyAreaName) {
        await ctx.db.patch(bill._id, { policyAreaName });
        patched++;
      }
    }

    const scanned = args.scanned + result.page.length;

    if (!result.isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.policyAreaBackfill.backfillBatch,
        {
          cursor: result.continueCursor,
          batchSize: numItems,
          patched,
          scanned,
        },
      );
      return;
    }

    console.log(
      `Policy-area backfill complete — patched ${patched} of ${scanned} bills scanned`,
    );
  },
});

/**
 * Diagnostic: backfill progress, and whether the two sources of a topic count
 * disagree — the count comes from `congressPolicyAreas` (derived from
 * `billSubjects`), the list filters on `bills.policyAreaName`.
 *
 *     npx convex run --prod policyAreaBackfill:status '{}'
 *
 * `drifted` counts probed bills with a policy area in `billSubjects` but not on
 * the bill — counted but not listable, so it MUST be 0; if it isn't, re-run
 * `policyAreaBackfill:run`. `missingOnBothSides` is benign (subjects never
 * synced). Deliberately an `internalQuery`: it reads several thousand documents
 * per call, which as a public query would be unauthenticated read burn.
 */
export const status = internalQuery({
  args: {},
  handler: async (ctx) => {
    const congresses = [117, 118, 119];
    const out: Array<{
      congress: number;
      probe: number;
      missingPolicyAreaInProbe: number;
      drifted: number;
      missingOnBothSides: number;
      driftExamples: string[];
      sampleTopics: Array<{ topic: string; reachable: number }>;
    }> = [];

    for (const congress of congresses) {
      const probe = await ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", congress))
        .take(1000);

      const sampleTopics: Array<{ topic: string; reachable: number }> = [];
      for (const topic of ["Health", "Taxation", "Animals"]) {
        const hits = await ctx.db
          .query("bills")
          .withIndex("by_congress_and_policy_area", (q) =>
            q.eq("congress", congress).eq("policyAreaName", topic),
          )
          .take(500);
        sampleTopics.push({ topic, reachable: hits.length });
      }

      const missing = probe.filter((b) => b.policyAreaName === undefined);
      let drifted = 0;
      let missingOnBothSides = 0;
      const driftExamples: string[] = [];
      for (const bill of missing) {
        const subject = await ctx.db
          .query("billSubjects")
          .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
          .first();
        if (subject?.policyAreaName) {
          drifted++;
          if (driftExamples.length < 5) driftExamples.push(bill.billId);
        } else {
          missingOnBothSides++;
        }
      }

      out.push({
        congress,
        probe: probe.length,
        missingPolicyAreaInProbe: missing.length,
        drifted,
        missingOnBothSides,
        driftExamples,
        sampleTopics,
      });
    }
    return out;
  },
});
