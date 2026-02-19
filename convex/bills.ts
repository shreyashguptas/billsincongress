import { query, internalQuery } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { v } from "convex/values";

// Bill stage constants (mirroring lib/utils/bill-stages.ts)
const BILL_STAGE_DESCRIPTIONS: Record<number, string> = {
  20: "Introduced",
  40: "In Committee",
  60: "Passed One Chamber",
  80: "Passed Both Chambers",
  85: "Vetoed",
  90: "To President",
  95: "Signed by President",
  100: "Became Law",
};

/**
 * Internal helper: check if any bills exist for a given congress.
 * Used by recomputeAllStats to discover which congresses to process.
 */
export const hasBillsForCongress = internalQuery({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .first();
    return bill !== null;
  },
});

/**
 * Get a single bill by its composite ID, including related data
 */
export const getById = query({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();

    if (!bill) return null;

    // Fetch related data in parallel
    const [subjects, summary, text] = await Promise.all([
      ctx.db
        .query("billSubjects")
        .withIndex("by_billId", (q) => q.eq("billId", args.billId))
        .first(),
      ctx.db
        .query("billSummaries")
        .withIndex("by_billId", (q) => q.eq("billId", args.billId))
        .order("desc")
        .first(),
      ctx.db
        .query("billText")
        .withIndex("by_billId", (q) => q.eq("billId", args.billId))
        .order("desc")
        .first(),
    ]);

    return {
      ...bill,
      bill_subjects: subjects
        ? { policy_area_name: subjects.policyAreaName || "" }
        : { policy_area_name: "" },
      latest_summary: summary?.text || "",
      pdf_url: text?.formatsUrlPdf || "",
    };
  },
});

/**
 * List bills with filtering and offset-based pagination.
 * Filters are applied in-memory after indexed query for the primary filter.
 */
export const list = query({
  args: {
    congress: v.optional(v.number()),
    progressStage: v.optional(v.number()),
    sponsorState: v.optional(v.string()),
    billType: v.optional(v.string()),
    titleFilter: v.optional(v.string()),
    sponsorFilter: v.optional(v.string()),
    billNumber: v.optional(v.string()),
    policyArea: v.optional(v.string()),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 9;
    const offset = args.offset || 0;

    // Use the most selective index. Default to latest congress to avoid full table scan.
    let congressFilter = args.congress;
    if (!congressFilter) {
      const latestBill = await ctx.db
        .query("bills")
        .withIndex("by_congress")
        .order("desc")
        .first();
      congressFilter = latestBill?.congress;
    }

    let results: Doc<"bills">[];
    if (congressFilter) {
      results = await ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", congressFilter!))
        .order("desc")
        .collect();
    } else {
      results = [];
    }

    // Apply in-memory filters
    let filtered = results;

    if (args.progressStage !== undefined) {
      filtered = filtered.filter((b) => b.progressStage === args.progressStage);
    }
    if (args.sponsorState) {
      filtered = filtered.filter((b) => b.sponsorState === args.sponsorState);
    }
    if (args.billType) {
      filtered = filtered.filter((b) => b.billType === args.billType);
    }
    if (args.billNumber) {
      filtered = filtered.filter((b) => b.billNumber === args.billNumber);
    }
    if (args.titleFilter) {
      const words = args.titleFilter
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      filtered = filtered.filter((b) =>
        words.every((word) => b.title.toLowerCase().includes(word))
      );
    }
    if (args.sponsorFilter) {
      const names = args.sponsorFilter
        .toLowerCase()
        .split(/\s+/)
        .filter((n) => n.length > 0);
      filtered = filtered.filter((b) =>
        names.some(
          (name) =>
            (b.sponsorFirstName || "").toLowerCase().includes(name) ||
            (b.sponsorLastName || "").toLowerCase().includes(name)
        )
      );
    }

    // Policy area filter requires a join to billSubjects
    if (args.policyArea) {
      const subjectDocs = await ctx.db
        .query("billSubjects")
        .withIndex("by_policy_area", (q) =>
          q.eq("policyAreaName", args.policyArea!)
        )
        .collect();
      const matchingBillIds = new Set(subjectDocs.map((s) => s.billId));
      filtered = filtered.filter((b) => matchingBillIds.has(b.billId));
    }

    const totalCount = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    // Enrich each bill with its policy area
    const enrichedPage = await Promise.all(
      page.map(async (bill) => {
        const subject = await ctx.db
          .query("billSubjects")
          .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
          .first();
        return {
          ...bill,
          bill_subjects: subject
            ? { policy_area_name: subject.policyAreaName || "" }
            : { policy_area_name: "" },
        };
      })
    );

    return {
      data: enrichedPage,
      count: totalCount,
    };
  },
});

/**
 * Get the latest congress info (congress number, start year, end year)
 */
export const getCongressInfo = query({
  handler: async (ctx) => {
    const latestBill = await ctx.db
      .query("bills")
      .withIndex("by_congress")
      .order("desc")
      .first();

    if (!latestBill) {
      return { congress: 119, startYear: 2025, endYear: 2027 };
    }

    const congress = latestBill.congress;
    const startYear = 2023 + (congress - 118) * 2;
    const endYear = startYear + 2;

    return { congress, startYear, endYear };
  },
});

/**
 * Get all distinct congress numbers from the precomputed stats table.
 * Reads ~3-5 tiny rows instead of probing the bills table.
 */
export const getCongressNumbers = query({
  handler: async (ctx) => {
    const stats = await ctx.db.query("congressStats").collect();
    return stats.map((s) => s.congress).sort((a, b) => b - a);
  },
});

/**
 * Homepage analytics: bill counts for all congresses (last 5).
 * Reads from precomputed congressStats table — ~5 tiny document reads total.
 */
export const billCountsByCongress = query({
  handler: async (ctx) => {
    const stats = await ctx.db.query("congressStats").collect();
    return stats
      .sort((a, b) => a.congress - b.congress)
      .slice(-5)
      .map((s) => ({
        congress: s.congress,
        bill_count: s.totalCount,
        house_bill_count: s.houseCount,
        senate_bill_count: s.senateCount,
      }));
  },
});

/**
 * Homepage analytics: status breakdown for the latest congress.
 * Reads a single precomputed congressStats row.
 */
export const latestCongressStatus = query({
  handler: async (ctx) => {
    const stats = await ctx.db.query("congressStats").collect();
    if (stats.length === 0) return { congress: 119, stages: [] };

    const latest = stats.reduce((a, b) =>
      a.congress > b.congress ? a : b
    );

    return {
      congress: latest.congress,
      stages: latest.stageCounts
        .map((s) => ({
          progress_stage: s.stage,
          progress_description: s.description,
          bill_count: s.count,
        }))
        .sort((a, b) => a.progress_stage - b.progress_stage),
    };
  },
});

/**
 * Get all unique policy areas for the filter dropdown
 */
export const getPolicyAreas = query({
  handler: async (ctx) => {
    const subjects = await ctx.db.query("billSubjects").collect();
    const areas = [
      ...new Set(
        subjects.map((s) => s.policyAreaName).filter((a): a is string => !!a)
      ),
    ];
    return areas.sort();
  },
});

/**
 * Get the latest completed sync snapshot for frontend display.
 */
export const getSyncStatus = query({
  handler: async (ctx) => {
    const completedSnapshot = await ctx.db
      .query("syncSnapshots")
      .withIndex("by_status", (q) => q.eq("status", "completed"))
      .order("desc")
      .first();

    if (!completedSnapshot) {
      return null;
    }

    return {
      syncType: completedSnapshot.syncType,
      completedAt: completedSnapshot.completedAt,
      totalProcessed: completedSnapshot.totalProcessed,
      totalSuccess: completedSnapshot.totalSuccess,
      totalFailed: completedSnapshot.totalFailed,
    };
  },
});

/**
 * Get comprehensive stats for a specific congress.
 * Uses ONLY precomputed tables - no heavy queries.
 */
export const getCongressDashboard = query({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    // Get precomputed stats - single fast query
    const stats = await ctx.db
      .query("congressStats")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .first();

    if (!stats) {
      return null;
    }

    // Get precomputed policy areas
    const policyAreas = await ctx.db
      .query("congressPolicyAreas")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .collect();

    const topPolicyAreas = policyAreas.slice(0, 10).map(p => ({
      name: p.policyAreaName,
      count: p.count,
    }));

    // Get precomputed sponsors
    const sponsors = await ctx.db
      .query("congressSponsors")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .collect();

    const topSponsors = sponsors.slice(0, 10).map(s => ({
      name: s.sponsorName,
      count: s.billCount,
      party: s.sponsorParty,
      state: s.sponsorState,
    }));

    // Build status breakdown from precomputed stageCounts
    const statusBreakdown = {
      introduced: 0,
      inCommittee: 0,
      passedOneChamber: 0,
      passedBothChambers: 0,
      vetoed: 0,
      toPresident: 0,
      signed: 0,
      becameLaw: 0,
    };

    for (const stage of stats.stageCounts) {
      switch (stage.stage) {
        case 20: statusBreakdown.introduced = stage.count; break;
        case 40: statusBreakdown.inCommittee = stage.count; break;
        case 60: statusBreakdown.passedOneChamber = stage.count; break;
        case 80: statusBreakdown.passedBothChambers = stage.count; break;
        case 85: statusBreakdown.vetoed = stage.count; break;
        case 90: statusBreakdown.toPresident = stage.count; break;
        case 95: statusBreakdown.signed = stage.count; break;
        case 100: statusBreakdown.becameLaw = stage.count; break;
      }
    }

    return {
      congress: args.congress,
      totalBills: stats.totalCount,
      houseCount: stats.houseCount,
      senateCount: stats.senateCount,
      statusBreakdown,
      topSponsors,
      topPolicyAreas,
      partyBreakdown: [],
      stateBreakdown: [],
      timelineMetrics: [
        { stage: "introduced", avgDays: 0, description: "Introduced" },
        { stage: "committee", avgDays: 0, description: "To Committee" },
        { stage: "passedOneChamber", avgDays: 0, description: "Passed One Chamber" },
        { stage: "passedBothChambers", avgDays: 0, description: "Passed Both Chambers" },
        { stage: "toPresident", avgDays: 0, description: "To President" },
        { stage: "signed", avgDays: 0, description: "Signed by President" },
        { stage: "law", avgDays: 0, description: "Became Law" },
      ],
    };
  },
});

/**
 * Get overview stats for all congresses at once
 */
export const getAllCongressOverview = query({
  handler: async (ctx) => {
    const stats = await ctx.db.query("congressStats").collect();
    
    return stats
      .sort((a, b) => a.congress - b.congress)
      .map(s => ({
        congress: s.congress,
        totalCount: s.totalCount,
        houseCount: s.houseCount,
        senateCount: s.senateCount,
        stageCounts: s.stageCounts,
        updatedAt: s.updatedAt,
      }));
  },
});
