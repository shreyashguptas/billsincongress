import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

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
