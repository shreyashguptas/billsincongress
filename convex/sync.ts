import { internalQuery } from "./_generated/server";
import { v } from "convex/values";
import {
  SYNC_DETAIL,
  SYNC_ACTIONS,
  SYNC_SUBJECTS,
  SYNC_SUMMARIES,
  SYNC_TEXT,
  SYNC_COMPLETE,
  getMissingEndpoints,
  classifySyncState,
} from "./syncStatus";

// Re-export the bitmask constants + helpers so existing importers
// (congressApi.ts, audit.ts) keep importing them from "./sync" unchanged.
export {
  SYNC_DETAIL,
  SYNC_ACTIONS,
  SYNC_SUBJECTS,
  SYNC_SUMMARIES,
  SYNC_TEXT,
  SYNC_COMPLETE,
  EXTRA_LEGISLATIVE_SUBJECTS,
  EXTRA_TEXT_VERSIONS,
  EXTRA_COMPLETE,
  getMissingEndpoints,
} from "./syncStatus";

/**
 * For a single bill, checks all 4 sub-tables for existence and returns a computed bitmask.
 * Used by the repair path to derive the bitmask for legacy bills that have no
 * syncedEndpoints value (the `isLegacy` branch of repairIncompleteBills).
 */
export const checkBillCompleteness = internalQuery({
  args: {
    billId: v.string(),
  },
  handler: async (ctx, args) => {
    // Detail is always set if the bill record exists
    let mask = SYNC_DETAIL;

    const actions = await ctx.db
      .query("billActions")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    if (actions) mask |= SYNC_ACTIONS;

    const subjects = await ctx.db
      .query("billSubjects")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    if (subjects) mask |= SYNC_SUBJECTS;

    const summaries = await ctx.db
      .query("billSummaries")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    if (summaries) mask |= SYNC_SUMMARIES;

    const text = await ctx.db
      .query("billText")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    if (text) mask |= SYNC_TEXT;

    return {
      billId: args.billId,
      syncedEndpoints: mask,
      isComplete: mask === SYNC_COMPLETE,
      missingEndpoints: getMissingEndpoints(mask),
    };
  },
});

/**
 * One page of INCOMPLETE bills (legacy or partial), found via the
 * by_syncedEndpoints index range. Convex orders `undefined` before all numbers,
 * so `.lt(SYNC_COMPLETE)` returns legacy (field missing) AND partial (0..30)
 * bills while complete bills (>=31) are never read — a healthy table reads ZERO
 * rows here regardless of size. This is what makes the repair job immune to the
 * per-query read limit.
 *
 * Optional `congress` filters the (already tiny) page in memory, avoiding a
 * second compound index.
 */
export const getIncompleteBillsPage = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
    congress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("bills")
      .withIndex("by_syncedEndpoints", (q) =>
        q.lt("syncedEndpoints", SYNC_COMPLETE),
      )
      .paginate({ cursor: args.cursor, numItems: args.numItems });

    const bills = page.page
      .filter(
        (b) => args.congress === undefined || b.congress === args.congress,
      )
      .map((b) => ({
        _id: b._id,
        billId: b.billId,
        congress: b.congress,
        billType: b.billType,
        billNumber: b.billNumber,
        syncedEndpoints: b.syncedEndpoints,
        missingEndpoints: getMissingEndpoints(b.syncedEndpoints ?? 0),
        isLegacy: b.syncedEndpoints === undefined,
      }));

    return {
      bills,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

const COMPLETENESS_SCAN_CAP = 4000; // safety bound on incomplete rows read

/**
 * Completeness diagnostic. Counts INCOMPLETE bills via the by_syncedEndpoints
 * index range (legacy + partial) — so it reads only the incomplete set (a
 * healthy table reads ~0 rows). `total` comes from the precomputed congressStats
 * table (no bills scan); complete = total - incomplete. `truncated` is true if
 * the incomplete set exceeded the safety cap (signals something is badly wrong).
 *
 * Internal-only; CLI:  npx convex run sync:getSyncCompleteness '{}'
 */
export const getSyncCompleteness = internalQuery({
  args: {
    congress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const incomplete = await ctx.db
      .query("bills")
      .withIndex("by_syncedEndpoints", (q) =>
        q.lt("syncedEndpoints", SYNC_COMPLETE),
      )
      .take(COMPLETENESS_SCAN_CAP);

    let partial = 0;
    let legacy = 0;
    for (const b of incomplete) {
      if (args.congress !== undefined && b.congress !== args.congress) continue;
      if (classifySyncState(b.syncedEndpoints) === "legacy") legacy++;
      else partial++;
    }

    // total from precomputed stats — never scans the bills table
    let total = 0;
    if (args.congress !== undefined) {
      const row = await ctx.db
        .query("congressStats")
        .withIndex("by_congress", (q) => q.eq("congress", args.congress!))
        .first();
      total = row?.totalCount ?? 0;
    } else {
      const stats = await ctx.db.query("congressStats").collect();
      total = stats.reduce((sum, s) => sum + s.totalCount, 0);
    }

    const incompleteCount = partial + legacy;
    return {
      total,
      complete: Math.max(0, total - incompleteCount),
      partial,
      legacy,
      truncated: incomplete.length >= COMPLETENESS_SCAN_CAP,
    };
  },
});
