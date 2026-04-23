import { internalMutation } from "./functions";
import {
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
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

    // Guard: if the aggregate reports fewer bills than we can see in a probe
    // of the bills table, the aggregate hasn't been fully backfilled yet.
    // Skip the write so we don't clobber a valid `congressStats` row with a
    // stale count.
    //
    // The probe size (1000) is tuned to catch partial-backfill states: with
    // 50-bill batches, a stalled backfill might have populated several
    // hundred aggregate entries before failing, and a smaller probe
    // wouldn't notice the mismatch. 1000 reads is well under the 16,384
    // per-mutation limit.
    const probe = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(1000);
    if (probe.length > totalCount) {
      console.warn(
        `recomputeCongressStats: aggregate reports ${totalCount} bills for congress ${args.congress} ` +
          `but a 1000-bill probe returned ${probe.length}. Skipping write — backfill likely incomplete.`,
      );
      return;
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

/*
 * ─────────────────────────────────────────────────────────────────────
 * Paginated policy-area / sponsor recomputes
 *
 * Previous versions used `.take(10000)` on both the bills table (per
 * congress) and the global billSubjects table. Both limits were too
 * tight: c119 alone has 15k bills and billSubjects globally has ~50k
 * rows, so the top-policy-areas counts were undercounting by an order
 * of magnitude (e.g. Taxation for c119 showed 65 when the true count
 * is 1,020).
 *
 * The fix paginates via internal queries. Single-mutation doc limits
 * still apply, so we run the aggregation inside an internal action
 * that chains many queries (actions have no doc limit), then hands the
 * final top-50 list to a single mutation to write atomically.
 * ─────────────────────────────────────────────────────────────────────
 */

/** Paginated fetch of bills for a given congress. */
export const getBillsPageByCongress = internalQuery({
  args: {
    congress: v.number(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
  },
});

/** Paginated fetch of billSubjects (global). */
export const getBillSubjectsPage = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("billSubjects")
      .paginate({ cursor: args.cursor, numItems: args.numItems });
  },
});

/** Replace the congressPolicyAreas rows for a congress in one transaction. */
export const writeCongressPolicyAreas = internalMutation({
  args: {
    congress: v.number(),
    areas: v.array(
      v.object({ policyAreaName: v.string(), count: v.number() }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("congressPolicyAreas")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    for (const doc of existing) await ctx.db.delete(doc._id);
    for (const area of args.areas) {
      await ctx.db.insert("congressPolicyAreas", {
        congress: args.congress,
        policyAreaName: area.policyAreaName,
        count: area.count,
      });
    }
  },
});

/** Replace the congressSponsors rows for a congress in one transaction. */
export const writeCongressSponsors = internalMutation({
  args: {
    congress: v.number(),
    sponsors: v.array(
      v.object({
        sponsorName: v.string(),
        sponsorParty: v.optional(v.string()),
        sponsorState: v.optional(v.string()),
        billCount: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("congressSponsors")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    for (const doc of existing) await ctx.db.delete(doc._id);
    for (const s of args.sponsors) {
      await ctx.db.insert("congressSponsors", {
        congress: args.congress,
        sponsorName: s.sponsorName,
        sponsorParty: s.sponsorParty,
        sponsorState: s.sponsorState,
        billCount: s.billCount,
      });
    }
  },
});

type BillPageResult = {
  page: Array<{
    billId: string;
    sponsorFirstName?: string;
    sponsorLastName?: string;
    sponsorParty?: string;
    sponsorState?: string;
  }>;
  isDone: boolean;
  continueCursor: string;
};

type SubjectPageResult = {
  page: Array<{ billId: string; policyAreaName?: string }>;
  isDone: boolean;
  continueCursor: string;
};

/**
 * Recompute the congressPolicyAreas table for a single congress.
 * Paginates through all bills for the congress and all billSubjects
 * globally — no silent cap.
 */
export const recomputeCongressPolicyAreas = internalAction({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const billIds = new Set<string>();
    let cursor: string | null = null;
    for (;;) {
      const page: BillPageResult = await ctx.runQuery(
        internal.mutations.getBillsPageByCongress,
        { congress: args.congress, cursor, numItems: 2000 },
      );
      for (const b of page.page) billIds.add(b.billId);
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const counts = new Map<string, number>();
    cursor = null;
    for (;;) {
      const page: SubjectPageResult = await ctx.runQuery(
        internal.mutations.getBillSubjectsPage,
        { cursor, numItems: 2000 },
      );
      for (const s of page.page) {
        if (s.policyAreaName && billIds.has(s.billId)) {
          counts.set(
            s.policyAreaName,
            (counts.get(s.policyAreaName) ?? 0) + 1,
          );
        }
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    const areas = [...counts.entries()]
      .map(([policyAreaName, count]) => ({ policyAreaName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    await ctx.runMutation(internal.mutations.writeCongressPolicyAreas, {
      congress: args.congress,
      areas,
    });
  },
});

/**
 * Recompute the congressSponsors table for a single congress.
 * Paginates through all bills so every sponsor is counted — previous
 * `take(10000)` version dropped ~5k bills for c119.
 */
export const recomputeCongressSponsors = internalAction({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const sponsorMap = new Map<
      string,
      { party?: string; state?: string; count: number }
    >();

    let cursor: string | null = null;
    for (;;) {
      const page: BillPageResult = await ctx.runQuery(
        internal.mutations.getBillsPageByCongress,
        { congress: args.congress, cursor, numItems: 2000 },
      );
      for (const b of page.page) {
        if (!b.sponsorFirstName && !b.sponsorLastName) continue;
        const name = `${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`.trim();
        const prev = sponsorMap.get(name);
        sponsorMap.set(name, {
          count: (prev?.count ?? 0) + 1,
          party: b.sponsorParty ?? prev?.party,
          state: b.sponsorState ?? prev?.state,
        });
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    // Store every unique sponsor for this congress (~500 members — tiny table).
    // The homepage slices to top 10 on read; the /bills sponsor filter needs
    // the full list so every member is selectable in the dropdown.
    const sponsors = [...sponsorMap.entries()]
      .map(([sponsorName, d]) => ({
        sponsorName,
        sponsorParty: d.party,
        sponsorState: d.state,
        billCount: d.count,
      }))
      .sort((a, b) => b.billCount - a.billCount);

    await ctx.runMutation(internal.mutations.writeCongressSponsors, {
      congress: args.congress,
      sponsors,
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

/**
 * Delete the precomputed stats rows (congressStats, congressPolicyAreas,
 * congressSponsors) for a specific congress. Intended for cleaning up
 * congresses that were never fully synced or are no longer displayed.
 *
 * Does NOT touch the bills table — run `deleteCongressBills` first if the
 * congress has actual bill rows.
 *
 *     npx convex run --prod mutations:deleteCongressStats '{"congress": 108}'
 */
export const deleteCongressStats = internalMutation({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const stats = await ctx.db
      .query("congressStats")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .collect();
    for (const s of stats) await ctx.db.delete(s._id);

    const policyAreas = await ctx.db
      .query("congressPolicyAreas")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    for (const p of policyAreas) await ctx.db.delete(p._id);

    const sponsors = await ctx.db
      .query("congressSponsors")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(10000);
    for (const s of sponsors) await ctx.db.delete(s._id);

    return {
      congressStats: stats.length,
      congressPolicyAreas: policyAreas.length,
      congressSponsors: sponsors.length,
    };
  },
});
