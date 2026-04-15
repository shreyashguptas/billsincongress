import { internalMutation } from "./functions";
import { v } from "convex/values";
import { billsByChamber, billsByStage, BILL_STAGES } from "./aggregates";

/**
 * Upsert a bill record. If a bill with the same billId exists, update it.
 * Otherwise, insert a new record.
 */
export const upsertBill = internalMutation({
  args: {
    billId: v.string(),
    congress: v.number(),
    billType: v.string(),
    billNumber: v.string(),
    billTypeLabel: v.string(),
    title: v.string(),
    titleWithoutNumber: v.optional(v.string()),
    introducedDate: v.string(),
    sponsorFirstName: v.optional(v.string()),
    sponsorLastName: v.optional(v.string()),
    sponsorParty: v.optional(v.string()),
    sponsorState: v.optional(v.string()),
    progressStage: v.optional(v.number()),
    progressDescription: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();

    const data = {
      ...args,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      return await ctx.db.insert("bills", data);
    }
  },
});

/**
 * Upsert bill actions. Replaces all actions for a given bill.
 */
export const upsertBillActions = internalMutation({
  args: {
    billId: v.string(),
    actions: v.array(
      v.object({
        actionCode: v.optional(v.string()),
        actionDate: v.string(),
        sourceSystemCode: v.optional(v.number()),
        sourceSystemName: v.optional(v.string()),
        text: v.string(),
        type: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete existing actions for this bill
    const existing = await ctx.db
      .query("billActions")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    // Insert new actions
    for (const action of args.actions) {
      await ctx.db.insert("billActions", {
        billId: args.billId,
        ...action,
      });
    }
  },
});

/**
 * Upsert bill subject/policy area.
 */
export const upsertBillSubject = internalMutation({
  args: {
    billId: v.string(),
    policyAreaName: v.optional(v.string()),
    policyAreaUpdateDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billSubjects")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        policyAreaName: args.policyAreaName,
        policyAreaUpdateDate: args.policyAreaUpdateDate,
      });
    } else {
      await ctx.db.insert("billSubjects", args);
    }
  },
});

/**
 * Upsert bill summary. Keeps the latest summary per bill.
 */
export const upsertBillSummary = internalMutation({
  args: {
    billId: v.string(),
    actionDate: v.optional(v.string()),
    actionDesc: v.optional(v.string()),
    text: v.string(),
    updateDate: v.string(),
    versionCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check if this exact version already exists
    const existing = await ctx.db
      .query("billSummaries")
      .withIndex("by_billId_and_date", (q) =>
        q.eq("billId", args.billId).eq("updateDate", args.updateDate)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("billSummaries", args);
    }
  },
});

/**
 * Upsert bill text/PDF info.
 */
export const upsertBillText = internalMutation({
  args: {
    billId: v.string(),
    date: v.optional(v.string()),
    formatsUrlTxt: v.optional(v.string()),
    formatsUrlPdf: v.optional(v.string()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billText")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("billText", args);
    }
  },
});

/**
 * Upsert bill titles. Replaces all titles for a given bill.
 */
export const upsertBillTitles = internalMutation({
  args: {
    billId: v.string(),
    titles: v.array(
      v.object({
        title: v.string(),
        titleType: v.optional(v.string()),
        titleTypeCode: v.optional(v.number()),
        updateDate: v.optional(v.string()),
        billTextVersionCode: v.optional(v.string()),
        billTextVersionName: v.optional(v.string()),
        chamberCode: v.optional(v.string()),
        chamberName: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Delete existing titles for this bill
    const existing = await ctx.db
      .query("billTitles")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    // Insert new titles
    for (const titleObj of args.titles) {
      await ctx.db.insert("billTitles", {
        billId: args.billId,
        ...titleObj,
      });
    }
  },
});

/**
 * Update the sync status bitmask for a bill.
 * Uses bitwise OR so bits are only ever added, never removed.
 */
export const updateBillSyncStatus = internalMutation({
  args: {
    billId: v.string(),
    endpointBits: v.number(),
    lastSyncAttempt: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();

    if (!existing) return;

    const currentMask = existing.syncedEndpoints || 0;
    const newMask = currentMask | args.endpointBits;

    await ctx.db.patch(existing._id, {
      syncedEndpoints: newMask,
      lastSyncAttempt: args.lastSyncAttempt,
    });
  },
});

/**
 * Recompute the congressStats row for a single congress.
 *
 * Reads counts from the `billsByChamber` and `billsByStage` aggregate
 * components instead of scanning the bills table. This is O(log n) and works
 * regardless of how many bills the congress has — historically this used
 * `.take(10000)` and silently truncated counts at 10,000 (Congress 118 alone
 * has 19,314 bills).
 *
 * Safety guard: if the aggregates report zero bills for a congress that
 * actually has bills (e.g. immediately after deploy, before
 * `aggregateBackfill:run` has populated them), skip the write so we don't
 * overwrite valid `congressStats` rows with zeros.
 */
export const recomputeCongressStats = internalMutation({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const ns = { namespace: args.congress };

    // Lexicographic bounds: every bill type starting with "h" sorts in
    // ["h", "i") and every "s" type in ["s", "t"). All current bill types are
    // covered by these two ranges (hr, hjres, hconres, hres / s, sjres,
    // sconres, sres).
    const houseBounds = {
      lower: { key: "h", inclusive: true },
      upper: { key: "i", inclusive: false },
    } as const;
    const senateBounds = {
      lower: { key: "s", inclusive: true },
      upper: { key: "t", inclusive: false },
    } as const;

    const [houseCount, senateCount] = await billsByChamber.countBatch(ctx, [
      { ...ns, bounds: houseBounds },
      { ...ns, bounds: senateBounds },
    ]);
    const totalCount = houseCount + senateCount;

    // Skip the write if aggregates haven't been backfilled yet — otherwise we
    // would zero out the existing precomputed row.
    if (totalCount === 0) {
      const billExists = await ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", args.congress))
        .first();
      if (billExists) {
        console.warn(
          `recomputeCongressStats: aggregates report 0 bills for congress ${args.congress} but the table is non-empty. Run aggregateBackfill:run first.`,
        );
        return;
      }
    }

    const stageQueries = BILL_STAGES.map(({ stage }) => ({
      ...ns,
      bounds: { eq: stage } as const,
    }));
    const stageResults = await billsByStage.countBatch(ctx, stageQueries);

    const stageCounts = BILL_STAGES.map(({ stage, description }, i) => ({
      stage,
      description,
      count: stageResults[i] ?? 0,
    })).filter((s) => s.count > 0);

    const stats = {
      congress: args.congress,
      totalCount,
      houseCount,
      senateCount,
      stageCounts,
      updatedAt: new Date().toISOString(),
    };

    const existingStats = await ctx.db
      .query("congressStats")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .first();

    if (existingStats) {
      await ctx.db.patch(existingStats._id, stats);
    } else {
      await ctx.db.insert("congressStats", stats);
    }
  },
});

/**
 * Recompute the congressPolicyAreas table for a single congress.
 * Uses take() limits to avoid Convex document limits.
 */
export const recomputeCongressPolicyAreas = internalMutation({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    // Get all billIds for this congress
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    
    const billIdSet = new Set(bills.map(b => b.billId));
    
    // Get all subjects - use take() to limit to 10000
    const subjects = await ctx.db
      .query("billSubjects")
      .take(10000);
    
    // Aggregate by policy area
    const policyAreaMap = new Map<string, number>();
    for (const subject of subjects) {
      if (billIdSet.has(subject.billId) && subject.policyAreaName) {
        policyAreaMap.set(subject.policyAreaName, (policyAreaMap.get(subject.policyAreaName) || 0) + 1);
      }
    }
    
    // Convert to array and sort by count descending
    const topAreas = Array.from(policyAreaMap.entries())
      .map(([policyAreaName, count]) => ({ policyAreaName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
    
    // Delete existing policy areas for this congress
    const existing = await ctx.db
      .query("congressPolicyAreas")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
    
    // Insert new policy areas
    for (const area of topAreas) {
      await ctx.db.insert("congressPolicyAreas", {
        congress: args.congress,
        policyAreaName: area.policyAreaName,
        count: area.count,
      });
    }
  },
});

/**
 * Recompute the congressSponsors table for a single congress.
 * Uses take() limits to avoid Convex document limits.
 */
export const recomputeCongressSponsors = internalMutation({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    // Get all bills for this congress
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    
    // Aggregate by sponsor name
    const sponsorMap = new Map<string, { party?: string; state?: string; count: number }>();
    for (const bill of bills) {
      if (bill.sponsorFirstName || bill.sponsorLastName) {
        const name = `${bill.sponsorFirstName || ""} ${bill.sponsorLastName || ""}`.trim();
        const existing = sponsorMap.get(name) || { count: 0, party: bill.sponsorParty, state: bill.sponsorState };
        sponsorMap.set(name, {
          count: existing.count + 1,
          party: bill.sponsorParty,
          state: bill.sponsorState,
        });
      }
    }
    
    // Convert to array and sort by count descending
    const topSponsors = Array.from(sponsorMap.entries())
      .map(([sponsorName, data]) => ({ sponsorName, ...data }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);
    
    // Delete existing sponsors for this congress
    const existing = await ctx.db
      .query("congressSponsors")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
    
    // Insert new sponsors
    for (const sponsor of topSponsors) {
      await ctx.db.insert("congressSponsors", {
        congress: args.congress,
        sponsorName: sponsor.sponsorName,
        sponsorParty: sponsor.party,
        sponsorState: sponsor.state,
        billCount: sponsor.count,
      });
    }
  },
});

/**
 * Create a sync snapshot to track a data sync operation
 */
export const createSyncSnapshot = internalMutation({
  args: {
    syncType: v.string(),
    congress: v.number(),
    billType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("syncSnapshots", {
      ...args,
      startedAt: new Date().toISOString(),
      status: "running",
    });
  },
});

/**
 * Update a sync snapshot with progress/completion info
 */
export const updateSyncSnapshot = internalMutation({
  args: {
    snapshotId: v.id("syncSnapshots"),
    status: v.optional(v.string()),
    completedAt: v.optional(v.string()),
    totalProcessed: v.optional(v.number()),
    totalSuccess: v.optional(v.number()),
    totalFailed: v.optional(v.number()),
    totalSkipped: v.optional(v.number()),
    errorDetails: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { snapshotId, ...updates } = args;
    await ctx.db.patch(snapshotId, updates);
  },
});

/**
 * Delete all bills for a specific congress
 */
export const deleteCongressBills = internalMutation({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    
    let deleted = 0;
    for (const bill of bills) {
      await ctx.db.delete(bill._id);
      deleted++;
    }
    
    return { deleted };
  },
});
