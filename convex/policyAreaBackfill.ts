import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

/**
 * One-time backfill of `bills.policyAreaName` from the existing `billSubjects`
 * table.
 *
 * Why this exists: the topic filter used to intersect two capped reads — the
 * first 2,000 `billSubjects` rows for a policy area (oldest-created, spanning
 * every congress) against the newest 1,200 bills of one congress. Those sets
 * barely overlapped, so `policyArea=Health` returned 0 results despite 2,070
 * matching bills in the 119th Congress, and small topics returned 1 of 65.
 * Storing the policy area on the bill turns that into an indexed lookup with no
 * cap on either side.
 *
 * Reads only data already in Convex — no Congress.gov API calls.
 *
 *     # default batch size (200):
 *     npx convex run --prod policyAreaBackfill:run '{}'
 *     # smaller batches if the logs show transaction-limit errors:
 *     npx convex run --prod policyAreaBackfill:run '{"batchSize": 100}'
 *
 * Check progress with `policyAreaBackfill:status`.
 *
 * Idempotent: a bill whose stored value already matches is skipped, so
 * re-running is safe and a re-run after a sync only touches what changed.
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
 * Process one page of bills and self-schedule the next.
 *
 * Uses the raw `internalMutation` rather than the trigger-wrapped one from
 * `./functions` on purpose: the bill aggregates are keyed on `billType` and
 * `progressStage`, neither of which this backfill touches, so firing them for
 * every one of ~55,000 bills would be pure write amplification with no effect
 * on the stored counts.
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
      // A bill with no subjects row yet keeps an absent policy area, which
      // simply leaves it out of the topic index until its subjects sync.
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
 * Diagnostic: backfill progress and, more importantly, whether the two sources
 * of a topic disagree.
 *
 *     npx convex run --prod policyAreaBackfill:status '{}'
 *
 * The count shown beside a filtered list comes from `congressPolicyAreas`, which
 * is derived from `billSubjects`, while the list itself filters on
 * `bills.policyAreaName`. Two sources for one number is the exact shape of the
 * bug this module exists to fix, so "are they equal?" deserves a measurement
 * rather than an argument — which is what `drifted` is.
 *
 * `drifted` counts probed bills that have a policy area in `billSubjects` but
 * not on the bill. Every one of those is a bill the count includes and the list
 * cannot show. **It must be 0.** If it isn't, re-run `policyAreaBackfill:run`.
 *
 * `missingOnBothSides` is the benign case: no policy area in either place,
 * because the bill's subjects have never synced. Those bills are absent from the
 * count and the list alike, so they cost nothing in consistency.
 *
 * Deliberately an `internalQuery`. It reads ~1,000 bills per congress plus a
 * `billSubjects` lookup for each bill missing a topic — several thousand
 * documents per call — which as a public query would be an unauthenticated way
 * to burn read bandwidth for no user-facing benefit. `npx convex run` reaches
 * internal functions with the deploy key, which is the only caller it needs.
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

      // For every probed bill with no topic on it, ask whether billSubjects has
      // one anyway. That difference is the drift, and it is the only case where
      // the count could exceed what the list can render.
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
