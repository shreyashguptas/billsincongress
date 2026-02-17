import { query } from "./_generated/server";
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
 * Get all distinct congress numbers available in the database.
 * Probes known congress range using the by_congress index instead of scanning all bills.
 */
export const getCongressNumbers = query({
  handler: async (ctx) => {
    const congresses: number[] = [];
    // Probe a reasonable range of congress numbers (93rd–120th covers 1973–2029)
    for (let c = 93; c <= 120; c++) {
      const bill = await ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", c))
        .first();
      if (bill) congresses.push(c);
    }
    return congresses.sort((a, b) => b - a);
  },
});

/**
 * Analytics: bill counts for a single congress.
 * Called once per congress from the server action to stay within Convex byte limits.
 */
export const billCountByCongress = query({
  args: { congress: v.number() },
  handler: async (ctx, args) => {
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .collect();

    let house = 0;
    let senate = 0;
    for (const bill of bills) {
      if (bill.billType.startsWith("h")) house++;
      else senate++;
    }

    return {
      congress: args.congress,
      bill_count: bills.length,
      house_bill_count: house,
      senate_bill_count: senate,
    };
  },
});

/**
 * Analytics: status breakdown for the latest congress.
 * Uses by_congress index to avoid full table scan.
 */
export const latestCongressStatus = query({
  handler: async (ctx) => {
    // Find the latest congress using the index (desc order, first result)
    const latestBill = await ctx.db
      .query("bills")
      .withIndex("by_congress")
      .order("desc")
      .first();

    if (!latestBill) return [];

    const latestCongress = latestBill.congress;

    // Fetch only bills for the latest congress
    const congressBills = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", latestCongress))
      .collect();

    const stageMap = new Map<number, { description: string; count: number }>();
    for (const bill of congressBills) {
      const stage = bill.progressStage || 20;
      const entry = stageMap.get(stage) || {
        description:
          bill.progressDescription ||
          BILL_STAGE_DESCRIPTIONS[stage] ||
          "Unknown",
        count: 0,
      };
      entry.count++;
      stageMap.set(stage, entry);
    }

    return Array.from(stageMap.entries())
      .map(([stage, data]) => ({
        progress_stage: stage,
        progress_description: data.description,
        bill_count: data.count,
      }))
      .sort((a, b) => a.progress_stage - b.progress_stage);
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
