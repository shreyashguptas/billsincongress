import { internalQuery, query } from "./_generated/server";
import { v } from "convex/values";

// Bitmask constants for endpoint tracking
export const SYNC_DETAIL = 1; // bit 0
export const SYNC_ACTIONS = 2; // bit 1
export const SYNC_SUBJECTS = 4; // bit 2
export const SYNC_SUMMARIES = 8; // bit 3
export const SYNC_TEXT = 16; // bit 4
export const SYNC_COMPLETE = 31; // all bits set

const ENDPOINT_NAMES: Record<number, string> = {
  [SYNC_DETAIL]: "detail",
  [SYNC_ACTIONS]: "actions",
  [SYNC_SUBJECTS]: "subjects",
  [SYNC_SUMMARIES]: "summaries",
  [SYNC_TEXT]: "text",
};

function getMissingEndpoints(mask: number): string[] {
  const missing: string[] = [];
  for (const [bit, name] of Object.entries(ENDPOINT_NAMES)) {
    if ((mask & Number(bit)) === 0) {
      missing.push(name);
    }
  }
  return missing;
}

/**
 * Returns bills where syncedEndpoints is undefined or < SYNC_COMPLETE.
 * Accepts optional congress filter and limit.
 */
export const getIncompleteBills = internalQuery({
  args: {
    congress: v.optional(v.number()),
    limit: v.optional(v.number()),
    legacyOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 100;
    const legacyOnly = args.legacyOnly || false;

    let billsQuery;
    if (args.congress !== undefined) {
      billsQuery = ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", args.congress!));
    } else {
      billsQuery = ctx.db.query("bills");
    }

    const allBills = await billsQuery.collect();
    const incomplete = [];

    for (const bill of allBills) {
      if (incomplete.length >= limit) break;

      const isLegacy = bill.syncedEndpoints === undefined;
      if (legacyOnly && !isLegacy) continue;

      if (isLegacy || bill.syncedEndpoints! < SYNC_COMPLETE) {
        const mask = bill.syncedEndpoints || 0;
        incomplete.push({
          _id: bill._id,
          billId: bill.billId,
          congress: bill.congress,
          billType: bill.billType,
          billNumber: bill.billNumber,
          syncedEndpoints: bill.syncedEndpoints,
          missingEndpoints: getMissingEndpoints(mask),
          isLegacy,
        });
      }
    }

    return incomplete;
  },
});

/**
 * For a single bill, checks all 4 sub-tables for existence and returns a computed bitmask.
 * Used by the backfill action for legacy bills that have no syncedEndpoints value.
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
 * Aggregate stats: total bills, complete, partial, legacy (undefined).
 * Public query for optional admin visibility.
 */
export const getSyncCompleteness = query({
  args: {
    congress: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let billsQuery;
    if (args.congress !== undefined) {
      billsQuery = ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", args.congress!));
    } else {
      billsQuery = ctx.db.query("bills");
    }

    const allBills = await billsQuery.collect();

    let total = 0;
    let complete = 0;
    let partial = 0;
    let legacy = 0;

    for (const bill of allBills) {
      total++;
      if (bill.syncedEndpoints === undefined) {
        legacy++;
      } else if (bill.syncedEndpoints >= SYNC_COMPLETE) {
        complete++;
      } else {
        partial++;
      }
    }

    return { total, complete, partial, legacy };
  },
});
