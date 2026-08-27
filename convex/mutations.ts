import { internalMutation } from "./functions";
import {
  internalAction,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  BILL_STAGES,
  HOUSE_BILL_TYPES,
  SENATE_BILL_TYPES,
} from "./aggregates";
import { calculateBillStage, passedChamber, BillStages } from "./billStage";
import { chamberOf } from "./chamber";
import { queueForIndexNow } from "./indexNow";
import { computeBaseRateBuckets, MS_PER_DAY } from "./baseRates";
import type { BaseRateSample, Chamber } from "./baseRates";

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
      // Skip no-op patches: any real write fires the aggregate triggers
      // (convex/functions.ts) and restamps `updatedAt`, which is the <lastmod>
      // the sitemap gives search engines (app/sitemap.ts). The monthly re-pull
      // resends every bill unchanged, so blind patching announces fake updates.
      const changed = (Object.keys(args) as Array<keyof typeof args>).some(
        (key) => (existing as Record<string, unknown>)[key] !== args[key],
      );
      if (!changed) return existing._id;

      // Only ping IndexNow for fields a reader actually sees; everything else
      // here is metadata the monthly re-pull rewrites unchanged.
      if (
        existing.progressStage !== args.progressStage ||
        existing.progressDescription !== args.progressDescription ||
        existing.title !== args.title
      ) {
        await queueForIndexNow(ctx, args.billId, "status");
      }
      await ctx.db.patch(existing._id, data);
      return existing._id;
    } else {
      const id = await ctx.db.insert("bills", data);
      await queueForIndexNow(ctx, args.billId, "new");
      return id;
    }
  },
});

/** Replaces (not merges) all stored actions for a bill. */
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
    const latestActionDate =
      args.actions.reduce<string | null>((latest, action) => {
        return latest === null || action.actionDate > latest
          ? action.actionDate
          : latest;
      }, null) ?? undefined;

    const existing = await ctx.db
      .query("billActions")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }

    for (const action of args.actions) {
      await ctx.db.insert("billActions", {
        billId: args.billId,
        ...action,
      });
    }

    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    if (bill && latestActionDate) {
      if (bill.latestActionDate !== latestActionDate) {
        await queueForIndexNow(ctx, args.billId, "action");
      }
      await ctx.db.patch(bill._id, { latestActionDate });
    }
  },
});

/**
 * Mirrors the policy area onto the bill itself — that copy is what the topic
 * filter reads (see the `policyAreaName` note in schema.ts). Both must be
 * written here or they drift apart.
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

    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    if (bill && bill.policyAreaName !== args.policyAreaName) {
      await queueForIndexNow(ctx, args.billId, "topic");
      await ctx.db.patch(bill._id, { policyAreaName: args.policyAreaName });
    }
  },
});

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
    const existing = await ctx.db
      .query("billSummaries")
      .withIndex("by_billId_and_date", (q) =>
        q.eq("billId", args.billId).eq("updateDate", args.updateDate)
      )
      .first();

    if (existing) {
      if (existing.text !== args.text) {
        await queueForIndexNow(ctx, args.billId, "summary");
      }
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("billSummaries", args);
      await queueForIndexNow(ctx, args.billId, "summary");
    }
  },
});

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

export const replaceBillLegislativeSubjects = internalMutation({
  args: {
    billId: v.string(),
    subjects: v.array(
      v.object({
        name: v.string(),
        updateDate: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billLegislativeSubjects")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
    for (const subject of args.subjects) {
      await ctx.db.insert("billLegislativeSubjects", {
        billId: args.billId,
        name: subject.name,
        updateDate: subject.updateDate,
      });
    }
  },
});

/**
 * Replaces ALL text versions for a bill; `getById` picks the current one by
 * finality/date, so every version must be stored, not just the last.
 */
export const replaceBillTextVersions = internalMutation({
  args: {
    billId: v.string(),
    versions: v.array(
      v.object({
        date: v.optional(v.string()),
        formatsUrlTxt: v.optional(v.string()),
        formatsUrlPdf: v.optional(v.string()),
        type: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("billText")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .collect();
    for (const doc of existing) {
      await ctx.db.delete(doc._id);
    }
    for (const version of args.versions) {
      await ctx.db.insert("billText", {
        billId: args.billId,
        ...version,
      });
    }
  },
});

/**
 * OR-in enrichment bits (1 = legislativeSubjects, 2 = text versions), kept
 * separate from `syncedEndpoints` so repair / SYNC_COMPLETE logic is untouched.
 */
export const setBillExtraSyncedBits = internalMutation({
  args: {
    billId: v.string(),
    bits: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    if (!existing) return;
    const current = existing.extraSyncedBits || 0;
    await ctx.db.patch(existing._id, {
      extraSyncedBits: current | args.bits,
    });
  },
});

/** Sync-status bitmask: OR only, so bits are added and never removed. */
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

export const writeCongressStats = internalMutation({
  args: {
    congress: v.number(),
    totalCount: v.number(),
    houseCount: v.number(),
    senateCount: v.number(),
    stageCounts: v.array(
      v.object({
        stage: v.number(),
        description: v.string(),
        count: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const stats = {
      congress: args.congress,
      totalCount: args.totalCount,
      houseCount: args.houseCount,
      senateCount: args.senateCount,
      stageCounts: args.stageCounts,
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

type StatsBillPageResult = {
  page: Array<{
    billType: string;
    progressStage?: number;
  }>;
  isDone: boolean;
  continueCursor: string;
};

/**
 * Recomputes congressStats for one congress by paginating every bill in an
 * action, so the counts are exact rather than aggregate-derived.
 */
export const recomputeCongressStats = internalAction({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    let cursor: string | null = null;
    let totalCount = 0;
    let houseCount = 0;
    let senateCount = 0;
    const stageCounts = new Map<number, number>();

    for (;;) {
      const page: StatsBillPageResult = await ctx.runQuery(
        internal.mutations.getBillsPageByCongress,
        { congress: args.congress, cursor, numItems: 2000 },
      );

      for (const bill of page.page) {
        totalCount += 1;
        if (bill.billType.startsWith("h")) houseCount += 1;
        if (bill.billType.startsWith("s")) senateCount += 1;
        if (bill.progressStage !== undefined) {
          stageCounts.set(
            bill.progressStage,
            (stageCounts.get(bill.progressStage) ?? 0) + 1,
          );
        }
      }

      if (page.isDone) break;
      cursor = page.continueCursor;
    }

    await ctx.runMutation(internal.mutations.writeCongressStats, {
      congress: args.congress,
      totalCount,
      houseCount,
      senateCount,
      stageCounts: BILL_STAGES.map(({ stage, description }) => ({
        stage,
        description,
        count: stageCounts.get(stage) ?? 0,
      })).filter((s) => s.count > 0),
    });
  },
});

/*
 * Paginated policy-area / sponsor recomputes.
 *
 * Per-transaction doc limits truncate these counts (an earlier `.take(10000)`
 * undercounted c119 by ~10x), so aggregation runs in an internal action
 * chaining paginated queries (actions have no doc limit) and one mutation
 * writes the result atomically.
 */

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

/** Paginated fetch of the whole bills table, projected to the backfill fields. */
export const getBillBackfillPage = internalQuery({
  args: {
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("bills")
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    return {
      bills: page.page.map((b) => ({
        _id: b._id,
        billId: b.billId,
        congress: b.congress,
        billType: b.billType,
        billNumber: b.billNumber,
        progressStage: b.progressStage,
        progressDescription: b.progressDescription,
        latestActionDate: b.latestActionDate,
        extraSyncedBits: b.extraSyncedBits ?? 0,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Same projection scoped to one congress via by_congress, so a per-congress
 * backfill does not paginate the whole table (the current congress sorts last,
 * behind ~37k older bills).
 */
export const getBillBackfillPageByCongress = internalQuery({
  args: {
    congress: v.number(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    return {
      bills: page.page.map((b) => ({
        _id: b._id,
        billId: b.billId,
        congress: b.congress,
        billType: b.billType,
        billNumber: b.billNumber,
        progressStage: b.progressStage,
        progressDescription: b.progressDescription,
        latestActionDate: b.latestActionDate,
        extraSyncedBits: b.extraSyncedBits ?? 0,
      })),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/**
 * Re-derives progressStage / progressDescription / latestActionDate from the
 * stored actions and patches only what changed.
 *
 * Uses the trigger-wrapped internalMutation so the billsByStage / billsByChamber
 * aggregates stay in sync. Bills with no stored actions are skipped, correctly
 * leaving latestActionDate unset ("excluded from recency filters").
 *
 * Call sites must keep numItems small (≤40): reading up to 250 actions per bill
 * must stay within Convex's per-transaction read limit.
 */
export const rederiveBillFieldsFromActions = internalMutation({
  args: {
    bills: v.array(
      v.object({
        _id: v.id("bills"),
        billId: v.string(),
        progressStage: v.optional(v.number()),
        progressDescription: v.optional(v.string()),
        latestActionDate: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let changed = 0;
    let skippedNoActions = 0;
    for (const bill of args.bills) {
      const actions = await ctx.db
        .query("billActions")
        .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
        .take(250);
      if (actions.length === 0) {
        skippedNoActions++;
        continue;
      }
      const { stage, description } = calculateBillStage(
        actions.map((a) => ({
          text: a.text,
          type: a.type,
          actionCode: a.actionCode,
        })),
      );
      // Mirror upsertBillActions' max-actionDate reducer exactly.
      const latestActionDate =
        actions.reduce<string | null>(
          (latest, a) =>
            latest === null || a.actionDate > latest ? a.actionDate : latest,
          null,
        ) ?? undefined;

      const patch: {
        progressStage?: number;
        progressDescription?: string;
        latestActionDate?: string;
      } = {};
      if (
        bill.progressStage !== stage ||
        bill.progressDescription !== description
      ) {
        patch.progressStage = stage;
        patch.progressDescription = description;
      }
      if (latestActionDate && bill.latestActionDate !== latestActionDate) {
        patch.latestActionDate = latestActionDate;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(bill._id, patch);
        changed++;
      }
    }
    return { changed, skippedNoActions };
  },
});

/**
 * Paginated bill numbers for one (congress, billType); reconcileMissingBills
 * diffs them against the live API list. Lives here, in a permanent module, so
 * the recurring cron has no dependency on that module.
 */
export const getBillNumbersForCongressType = internalQuery({
  args: {
    congress: v.number(),
    billType: v.string(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_type", (q) =>
        q.eq("congress", args.congress).eq("billType", args.billType),
      )
      .paginate({ cursor: args.cursor, numItems: args.numItems });
    return {
      numbers: page.page.map((b) => b.billNumber),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
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
    policyAreaName?: string;
    sponsorFirstName?: string;
    sponsorLastName?: string;
    sponsorParty?: string;
    sponsorState?: string;
  }>;
  isDone: boolean;
  continueCursor: string;
};

/**
 * Recomputes congressPolicyAreas for one congress by counting each bill's own
 * `policyAreaName` — the same field the topic list filters on, so a count can
 * never claim bills the list cannot render (incident: see the `policyAreaName`
 * note in schema.ts).
 */
export const recomputeCongressPolicyAreas = internalAction({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const counts = new Map<string, number>();
    let cursor: string | null = null;
    for (;;) {
      const page: BillPageResult = await ctx.runQuery(
        internal.mutations.getBillsPageByCongress,
        { congress: args.congress, cursor, numItems: 2000 },
      );
      for (const b of page.page) {
        if (b.policyAreaName) {
          counts.set(
            b.policyAreaName,
            (counts.get(b.policyAreaName) ?? 0) + 1,
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
 * Recomputes congressSponsors for one congress, paginating all bills so the
 * counts are never truncated.
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

    // Store EVERY sponsor (~500 members): the homepage slices to top 10, but
    // the /bills sponsor filter needs the full list. Do not truncate here.
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

/*
 * Chamber deep breakdown precompute. Paginates the bills table to dodge the
 * 16K-doc per-mutation read limit, aggregates in an action, then writes the row
 * atomically; `getChamberDeepBreakdown` reads it in O(1) instead of scanning
 * 6-7K docs.
 */

function normaliseParty(raw: string | undefined): "D" | "R" | "I" | "U" {
  if (!raw) return "U";
  const v = raw.trim().toUpperCase();
  if (v === "D") return "D";
  if (v === "R") return "R";
  if (v === "I" || v === "ID" || v === "IND") return "I";
  return "U";
}

export const getChamberBillsPage = internalQuery({
  args: {
    congress: v.number(),
    billType: v.string(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bills")
      .withIndex("by_congress_and_type", (q) =>
        q.eq("congress", args.congress).eq("billType", args.billType),
      )
      .paginate({ cursor: args.cursor, numItems: args.numItems });
  },
});

/** Atomic write of a (congress, chamber) breakdown row. */
export const writeCongressChamberBreakdown = internalMutation({
  args: {
    congress: v.number(),
    chamber: v.union(v.literal("house"), v.literal("senate")),
    total: v.number(),
    partyCounts: v.object({
      D: v.number(),
      R: v.number(),
      I: v.number(),
      U: v.number(),
    }),
    partyLawCounts: v.object({
      D: v.number(),
      R: v.number(),
      I: v.number(),
      U: v.number(),
    }),
    stateCounts: v.array(
      v.object({ state: v.string(), count: v.number() }),
    ),
    monthly: v.array(
      v.object({
        month: v.string(),
        count: v.number(),
        becameLaw: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("congressChamberBreakdowns")
      .withIndex("by_congress_and_chamber", (q) =>
        q.eq("congress", args.congress).eq("chamber", args.chamber),
      )
      .unique();

    const data = {
      congress: args.congress,
      chamber: args.chamber,
      total: args.total,
      partyCounts: args.partyCounts,
      partyLawCounts: args.partyLawCounts,
      stateCounts: args.stateCounts,
      monthly: args.monthly,
      updatedAt: new Date().toISOString(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("congressChamberBreakdowns", data);
    }
  },
});

type ChamberBillPageResult = {
  page: Array<{
    sponsorParty?: string;
    sponsorState?: string;
    progressStage?: number;
    introducedDate: string;
  }>;
  isDone: boolean;
  continueCursor: string;
};

/**
 * Recomputes one (congress, chamber) breakdown, paginating every bill type in
 * the chamber so the total is never silently truncated.
 */
export const recomputeCongressChamberBreakdown = internalAction({
  args: {
    congress: v.number(),
    chamber: v.union(v.literal("house"), v.literal("senate")),
  },
  handler: async (ctx, args) => {
    const billTypes =
      args.chamber === "house" ? HOUSE_BILL_TYPES : SENATE_BILL_TYPES;

    const partyCounts: Record<"D" | "R" | "I" | "U", number> = {
      D: 0,
      R: 0,
      I: 0,
      U: 0,
    };
    const partyLawCounts: Record<"D" | "R" | "I" | "U", number> = {
      D: 0,
      R: 0,
      I: 0,
      U: 0,
    };
    const stateCounts = new Map<string, number>();
    const monthCounts = new Map<string, { total: number; law: number }>();
    let total = 0;

    for (const billType of billTypes) {
      let cursor: string | null = null;
      for (;;) {
        const page: ChamberBillPageResult = await ctx.runQuery(
          internal.mutations.getChamberBillsPage,
          {
            congress: args.congress,
            billType,
            cursor,
            numItems: 2000,
          },
        );
        for (const bill of page.page) {
          total += 1;
          const party = normaliseParty(bill.sponsorParty);
          const isLaw = bill.progressStage === 100;
          partyCounts[party] += 1;
          if (isLaw) partyLawCounts[party] += 1;

          // Only valid ASCII state codes, so the top-states list gets no
          // "Unknown" bucket.
          if (
            bill.sponsorState &&
            /^[A-Z]{2,3}$/.test(bill.sponsorState)
          ) {
            stateCounts.set(
              bill.sponsorState,
              (stateCounts.get(bill.sponsorState) || 0) + 1,
            );
          }

          // introducedDate is "YYYY-MM-DD"; bucket by month.
          const month = (bill.introducedDate || "").slice(0, 7);
          if (month) {
            const entry = monthCounts.get(month) || {
              total: 0,
              law: 0,
            };
            entry.total += 1;
            if (isLaw) entry.law += 1;
            monthCounts.set(month, entry);
          }
        }
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }

    const stateCountsArr = [...stateCounts.entries()]
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count);
    const monthly = [...monthCounts.entries()]
      .map(([month, v]) => ({
        month,
        count: v.total,
        becameLaw: v.law,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    await ctx.runMutation(
      internal.mutations.writeCongressChamberBreakdown,
      {
        congress: args.congress,
        chamber: args.chamber,
        total,
        partyCounts,
        partyLawCounts,
        stateCounts: stateCountsArr,
        monthly,
      },
    );
  },
});

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

const DELETE_CONGRESS_BATCH_SIZE = 50;

/**
 * Delete one bounded batch of bills for a specific congress, including related
 * child rows. Callers that need a full wipe must loop until `hasMore` is false.
 */
export const deleteCongressBills = internalMutation({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .take(DELETE_CONGRESS_BATCH_SIZE);

    let deleted = 0;
    for (const bill of bills) {
      const actions = await ctx.db
        .query("billActions")
        .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
        .collect();
      for (const doc of actions) await ctx.db.delete(doc._id);

      const subjects = await ctx.db
        .query("billSubjects")
        .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
        .collect();
      for (const doc of subjects) await ctx.db.delete(doc._id);

      const summaries = await ctx.db
        .query("billSummaries")
        .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
        .collect();
      for (const doc of summaries) await ctx.db.delete(doc._id);

      const textVersions = await ctx.db
        .query("billText")
        .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
        .collect();
      for (const doc of textVersions) await ctx.db.delete(doc._id);

      const titles = await ctx.db
        .query("billTitles")
        .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
        .collect();
      for (const doc of titles) await ctx.db.delete(doc._id);

      await ctx.db.delete(bill._id);
      deleted++;
    }

    return {
      deleted,
      hasMore: bills.length === DELETE_CONGRESS_BATCH_SIZE,
    };
  },
});

/**
 * Deletes the precomputed stats rows for a congress. Does NOT touch the bills
 * table — run `deleteCongressBills` first if it still has bill rows.
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

/*
 * Committee base rates: from FINISHED congresses only, the share of bills that,
 * having sat in committee N days, ever advanced past committee. Paginate in an
 * action, aggregate via the pure helper, swap the table in one mutation.
 * Math + definitions live in `./baseRates` (unit-tested in baseRates.test.ts).
 */

type BaseRatePageResult = {
  page: Array<{
    billId: string;
    billType: string;
    introducedDate: string;
    progressStage?: number;
  }>;
  isDone: boolean;
  continueCursor: string;
};

export const getBillActionsForBaseRate = internalQuery({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const actions = await ctx.db
      .query("billActions")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .collect();
    return actions.map((a) => ({
      text: a.text,
      type: a.type,
      actionCode: a.actionCode,
      actionDate: a.actionDate,
    }));
  },
});

/**
 * Recompute the committeeBaseRates table from every finished Congress's bills.
 * Run weekly by cron, and on demand for the initial backfill:
 *   npx convex run --prod mutations:recomputeCommitteeBaseRates
 */
export const recomputeCommitteeBaseRates = internalAction({
  args: {},
  handler: async (ctx): Promise<{ finishedCongresses: number[]; samples: number }> => {
    // Current congress by year (mirrors recomputeAllStats); only strictly
    // earlier congresses are "finished" and safe to learn base rates from.
    const currentCongress =
      Math.floor((new Date().getFullYear() - 1789) / 2) + 1;

    const finishedCongresses: number[] = [];
    for (let c = 93; c < currentCongress; c++) {
      const has = await ctx.runQuery(internal.bills.hasBillsForCongress, {
        congress: c,
      });
      if (has) finishedCongresses.push(c);
    }

    const samples: BaseRateSample[] = [];

    for (const congress of finishedCongresses) {
      let cursor: string | null = null;
      for (;;) {
        // Explicit type (like StatsBillPageResult) breaks the recursive-inference
        // cycle, but widened with the fields the base-rate timing needs.
        const page: BaseRatePageResult = await ctx.runQuery(
          internal.mutations.getBillsPageByCongress,
          { congress, cursor, numItems: 2000 },
        );

        for (const bill of page.page) {
          const stage = bill.progressStage ?? BillStages.INTRODUCED;
          // Reference group: bills that reached committee.
          if (stage < BillStages.IN_COMMITTEE) continue;

          const chamber: Chamber = chamberOf(bill.billType);
          const advanced = stage >= BillStages.PASSED_ONE_CHAMBER;

          if (!advanced) {
            samples.push({ chamber, advanced: false, firstAdvanceDays: null });
            continue;
          }

          // Advanced: find the EARLIEST chamber-passage action to time it.
          const actions = await ctx.runQuery(
            internal.mutations.getBillActionsForBaseRate,
            { billId: bill.billId },
          );
          const introMs = Date.parse(bill.introducedDate);
          let firstAdvanceMs: number | null = null;
          for (const a of actions) {
            if (passedChamber(a) === null) continue;
            const ms = Date.parse(a.actionDate);
            if (Number.isNaN(ms)) continue;
            if (firstAdvanceMs === null || ms < firstAdvanceMs) firstAdvanceMs = ms;
          }

          const firstAdvanceDays =
            firstAdvanceMs !== null && !Number.isNaN(introMs)
              ? Math.max(0, Math.floor((firstAdvanceMs - introMs) / MS_PER_DAY))
              : null;

          samples.push({ chamber, advanced: true, firstAdvanceDays });
        }

        if (page.isDone) break;
        cursor = page.continueCursor;
      }
    }

    await ctx.runMutation(internal.mutations.writeCommitteeBaseRates, {
      buckets: computeBaseRateBuckets(samples),
    });

    console.log(
      `committee base rates: ${samples.length} bills across congresses ${finishedCongresses.join(", ")}`,
    );
    return { finishedCongresses, samples: samples.length };
  },
});

/** Atomically replace the committeeBaseRates table with a fresh set of rows. */
export const writeCommitteeBaseRates = internalMutation({
  args: {
    buckets: v.array(
      v.object({
        chamber: v.union(v.literal("house"), v.literal("senate")),
        bucketStart: v.number(),
        bucketEnd: v.number(),
        advancedCount: v.number(),
        totalCount: v.number(),
        ratePercent: v.number(),
        sampleSize: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("committeeBaseRates").collect();
    for (const row of existing) await ctx.db.delete(row._id);

    const updatedAt = new Date().toISOString();
    for (const b of args.buckets) {
      await ctx.db.insert("committeeBaseRates", { ...b, updatedAt });
    }
  },
});
