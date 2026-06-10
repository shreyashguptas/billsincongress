import { query, internalQuery, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { billsByChamber, billsByStage } from "./aggregates";
import { calculateBillStage } from "./billStage";

// Bounds for reading a single bill's child rows. Real bills have only a handful
// of summaries / text versions, so these caps are generous safety limits.
const MAX_SUMMARIES_PER_BILL = 50;
const MAX_TEXT_VERSIONS_PER_BILL = 50;

/** Effective date for ordering a summary: prefer actionDate, fall back to updateDate. */
function summaryEffectiveDate(s: Doc<"billSummaries">): string {
  return s.actionDate || s.updateDate || "";
}

/**
 * Pick the summary describing the most advanced action — the one with the
 * latest effective date. The Library of Congress returns summaries in an order
 * that is NOT chronological, so we must select by date rather than by array
 * position / `_creationTime`.
 */
function pickLatestSummary(
  summaries: Doc<"billSummaries">[],
): Doc<"billSummaries"> | null {
  if (summaries.length === 0) return null;
  return [...summaries].sort((a, b) => {
    const da = summaryEffectiveDate(a);
    const db = summaryEffectiveDate(b);
    return da < db ? 1 : da > db ? -1 : 0;
  })[0];
}

/**
 * Rank a bill-text version by how final it is. The "current" text is the most
 * advanced version that exists (a signed Public Law supersedes the Enrolled
 * copy, which supersedes Engrossed, etc.).
 */
function textVersionRank(type: string | undefined): number {
  const t = (type || "").toLowerCase();
  if (t.includes("public law") || t.includes("private law")) return 100;
  if (t.includes("enrolled")) return 90;
  if (t.includes("engrossed amendment")) return 80;
  if (t.includes("engrossed")) return 70;
  if (t.includes("reported")) return 60;
  if (t.includes("placed on calendar")) return 55;
  if (t.includes("referred")) return 50;
  if (t.includes("considered")) return 45;
  if (t.includes("introduced")) return 40;
  return 10;
}

/**
 * Pick the current text version: most final by rank, then most recent by date.
 * Works on the single legacy row stored today and improves automatically once
 * the sync stores every text version.
 */
function pickCurrentText(texts: Doc<"billText">[]): Doc<"billText"> | null {
  if (texts.length === 0) return null;
  return [...texts].sort((a, b) => {
    const ra = textVersionRank(a.type);
    const rb = textVersionRank(b.type);
    if (ra !== rb) return rb - ra;
    const da = a.date || "";
    const db = b.date || "";
    return da < db ? 1 : da > db ? -1 : 0;
  })[0];
}

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

    // Fetch related data in parallel. Summaries and text versions are selected
    // by date / finality (see helpers above), NOT by array position — the
    // Library of Congress does not return them in chronological order.
    const [subjects, summaries, texts] = await Promise.all([
      ctx.db
        .query("billSubjects")
        .withIndex("by_billId", (q) => q.eq("billId", args.billId))
        .first(),
      ctx.db
        .query("billSummaries")
        .withIndex("by_billId", (q) => q.eq("billId", args.billId))
        .take(MAX_SUMMARIES_PER_BILL),
      ctx.db
        .query("billText")
        .withIndex("by_billId", (q) => q.eq("billId", args.billId))
        .take(MAX_TEXT_VERSIONS_PER_BILL),
    ]);

    const summary = pickLatestSummary(summaries);
    const text = pickCurrentText(texts);

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
 * Read-only diagnostic: dump a bill's stored actions (code/type/text/date) and
 * compare its stored stage against the freshly-computed one. Used to verify the
 * veto-detection fix against production data without any API calls, e.g.
 *   npx convex run bills:debugBillStage '{"billId":"4199s118"}'
 */
export const debugBillStage = internalQuery({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    const actions = await ctx.db
      .query("billActions")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .take(250);
    const computed = calculateBillStage(
      actions.map((a) => ({
        text: a.text,
        type: a.type,
        actionCode: a.actionCode,
      })),
    );
    return {
      billId: args.billId,
      exists: bill !== null,
      storedStage: bill?.progressStage,
      storedDescription: bill?.progressDescription,
      computedStage: computed.stage,
      computedDescription: computed.description,
      actionCount: actions.length,
      actions: actions.map((a) => ({
        date: a.actionDate,
        code: a.actionCode,
        type: a.type,
        text: a.text,
      })),
    };
  },
});

/**
 * Read-only spot-check for the enrichment backfill: reports a bill's
 * extraSyncedBits, how many legislative subjects and text versions are stored,
 * and small samples. Compare the subject count against the live
 * `/subjects` `pagination.count` (e.g. 1hr119 ≈ 239) to confirm fidelity.
 *   npx convex run bills:debugBillEnrichment '{"billId":"1hr119"}'
 */
export const debugBillEnrichment = internalQuery({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .first();
    const legislativeSubjects = await ctx.db
      .query("billLegislativeSubjects")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .take(500);
    const texts = await ctx.db
      .query("billText")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .take(100);
    return {
      billId: args.billId,
      extraSyncedBits: bill?.extraSyncedBits ?? 0,
      legislativeSubjectCount: legislativeSubjects.length,
      sampleSubjects: legislativeSubjects.slice(0, 8).map((s) => s.name),
      textVersionCount: texts.length,
      textVersionTypes: texts.map((t) => t.type),
    };
  },
});

// A bill stores at most 250 actions (the sync fetches with limit=250).
const MAX_BILL_ACTIONS = 250;
const RECENT_ACTIONS_LIMIT = 20;

/**
 * Get a bill's most-recent actions (internal query, feeds the AI chatbot).
 *
 * Actions are stored newest-first (the sync deletes + re-inserts in the order
 * the Library of Congress API returns them), so reading the index by
 * `_creationTime` does NOT give chronological order — the previous
 * `.order("desc").take(20)` returned the 20 *oldest* actions and the chatbot
 * presented them as "Recent." We instead read the bounded set and sort by
 * `actionDate` descending. The sort is stable, so actions sharing a date keep
 * their stored order (the API's own newest-first ordering within a day).
 */
export const getBillActions = internalQuery({
  args: { billId: v.string() },
  handler: async (ctx, args) => {
    const actions = await ctx.db
      .query("billActions")
      .withIndex("by_billId", (q) => q.eq("billId", args.billId))
      .take(MAX_BILL_ACTIONS);

    const sorted = [...actions].sort((a, b) =>
      a.actionDate < b.actionDate ? 1 : a.actionDate > b.actionDate ? -1 : 0,
    );

    return sorted.slice(0, RECENT_ACTIONS_LIMIT).map((a) => ({
      date: a.actionDate,
      description: a.text,
    }));
  },
});

/**
 * Shared filter args for the bills list + count queries.
 */
const BILLS_FILTER_ARGS = {
  congress: v.optional(v.number()),
  progressStage: v.optional(v.number()),
  sponsorState: v.optional(v.string()),
  billType: v.optional(v.string()),
  titleFilter: v.optional(v.string()),
  // Exact full names ("First Last"). Empty or missing = no sponsor filter.
  // A bill matches if "sponsorFirstName sponsorLastName" is in the list.
  sponsorFilter: v.optional(v.array(v.string())),
  billNumber: v.optional(v.string()),
  policyArea: v.optional(v.string()),
  introducedDateFilter: v.optional(v.string()),
  lastActionDateFilter: v.optional(v.string()),
};

type BillsFilterArgs = {
  congress?: number;
  progressStage?: number;
  sponsorState?: string;
  billType?: string;
  titleFilter?: string;
  sponsorFilter?: string[];
  billNumber?: string;
  policyArea?: string;
  introducedDateFilter?: string;
  lastActionDateFilter?: string;
};

type BillsCountResult = {
  count: number | null;
  exact: boolean;
};

const unknownCount = (): BillsCountResult => ({ count: null, exact: false });

const normaliseName = (s: string) =>
  s.trim().toLowerCase().replace(/\s+/g, " ");

const MAX_LIST_LIMIT = 50;
const MAX_LIST_OFFSET = 500;
const MAX_LIST_SCAN = 1200;
const MAX_POLICY_SUBJECTS_FOR_LIST = 2000;
const MAX_SPONSOR_FILTERS = 10;
const MAX_TEXT_FILTER_LENGTH = 120;

function clampPageNumber(
  value: number | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(Math.floor(value), max));
}

function validatePublicFilters(args: BillsFilterArgs) {
  const boundedStrings: Array<[string, string | undefined]> = [
    ["titleFilter", args.titleFilter],
    ["billNumber", args.billNumber],
    ["policyArea", args.policyArea],
    ["sponsorState", args.sponsorState],
    ["billType", args.billType],
    ["introducedDateFilter", args.introducedDateFilter],
    ["lastActionDateFilter", args.lastActionDateFilter],
  ];
  for (const [name, value] of boundedStrings) {
    if (value !== undefined && value.length > MAX_TEXT_FILTER_LENGTH) {
      throw new Error(`${name} is too long.`);
    }
  }
  if (
    args.sponsorFilter &&
    (args.sponsorFilter.length > MAX_SPONSOR_FILTERS ||
      args.sponsorFilter.some((s) => s.length > MAX_TEXT_FILTER_LENGTH))
  ) {
    throw new Error("Too many sponsor filters.");
  }
}

function cutoffDateForFilter(filter: string | undefined): string | null {
  if (!filter || filter === "all") return null;
  const daysByFilter: Record<string, number> = {
    week: 7,
    month: 30,
    "3months": 90,
    "6months": 180,
    year: 365,
  };
  const days = daysByFilter[filter];
  if (!days) return null;
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/**
 * Resolve the congress to filter by, defaulting to the latest one.
 * Returns `null` when the bills table is empty.
 */
async function resolveCongress(
  ctx: QueryCtx,
  requested: number | undefined,
): Promise<number | null> {
  if (requested !== undefined) return requested;
  const latestBill = await ctx.db
    .query("bills")
    .withIndex("by_congress")
    .order("desc")
    .first();
  return latestBill?.congress ?? null;
}

/**
 * Build an in-memory predicate that matches bills against all filter args.
 *
 * We pre-resolve the policy-area billId set once (rather than on each bill),
 * and pre-tokenise the title / sponsor filters. The returned predicate is a
 * tight per-bill check used by both the streaming list query and the count
 * query. `matchesNone` short-circuits when the policy-area filter has zero
 * subjects — no bill can possibly match, so the caller can skip iterating.
 */
async function buildBillPredicate(
  ctx: QueryCtx,
  args: BillsFilterArgs,
): Promise<{
  matchesNone: boolean;
  match: (bill: Doc<"bills">) => boolean;
}> {
  let policyBillIds: Set<string> | null = null;
  if (args.policyArea) {
    const policyArea = args.policyArea;
    const subjectDocs = await ctx.db
      .query("billSubjects")
      .withIndex("by_policy_area", (q) =>
        q.eq("policyAreaName", policyArea),
      )
      .take(MAX_POLICY_SUBJECTS_FOR_LIST);
    policyBillIds = new Set(subjectDocs.map((s) => s.billId));
    if (policyBillIds.size === 0) {
      return { matchesNone: true, match: () => false };
    }
  }

  const titleWords = args.titleFilter
    ? args.titleFilter
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 0)
    : null;

  // Exact full-name match against a normalised set (lowercase, collapsed
  // whitespace). Matches the semantics of the multi-select sponsor combobox.
  const wantedSponsors =
    args.sponsorFilter && args.sponsorFilter.length > 0
      ? new Set(args.sponsorFilter.map(normaliseName))
      : null;

  const match = (bill: Doc<"bills">): boolean => {
    if (args.progressStage !== undefined && bill.progressStage !== args.progressStage) return false;
    if (args.sponsorState && bill.sponsorState !== args.sponsorState) return false;
    if (args.billType && bill.billType !== args.billType) return false;
    if (args.billNumber && bill.billNumber !== args.billNumber) return false;
    const introducedCutoff = cutoffDateForFilter(args.introducedDateFilter);
    if (introducedCutoff && bill.introducedDate < introducedCutoff) return false;
    const lastActionCutoff = cutoffDateForFilter(args.lastActionDateFilter);
    if (
      lastActionCutoff &&
      (bill.latestActionDate ?? "") < lastActionCutoff
    ) {
      return false;
    }
    if (titleWords) {
      const title = bill.title.toLowerCase();
      for (const w of titleWords) {
        if (!title.includes(w)) return false;
      }
    }
    if (wantedSponsors) {
      const fullName = normaliseName(
        `${bill.sponsorFirstName ?? ""} ${bill.sponsorLastName ?? ""}`,
      );
      if (!wantedSponsors.has(fullName)) return false;
    }
    if (policyBillIds && !policyBillIds.has(bill.billId)) return false;
    return true;
  };

  return { matchesNone: false, match };
}

/**
 * List bills with filtering and offset-based pagination.
 *
 * Streams the `by_congress` index newest-first and stops as soon as we've
 * collected `offset + limit + 1` matching bills (the +1 tells us whether
 * more pages exist). Previously this query did `.collect()` on the full
 * congress (up to ~19K docs) and filtered in-memory, which dominated the
 * 4–5s drill-through latency. The common happy-path (no filters, or a
 * selective filter like sponsor) now reads ~10 docs instead.
 *
 * Total count is intentionally NOT returned from this query — computing it
 * still requires a full filter scan, which would re-introduce the same
 * latency. Callers that need the total should use `listCount` in parallel.
 */
export const list = query({
  args: {
    ...BILLS_FILTER_ARGS,
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    validatePublicFilters(args);
    const limit = Math.max(
      1,
      clampPageNumber(args.limit, 9, MAX_LIST_LIMIT),
    );
    const offset = clampPageNumber(args.offset, 0, MAX_LIST_OFFSET);

    const congressFilter = await resolveCongress(ctx, args.congress);
    if (congressFilter === null) return { data: [], hasMore: false };

    const { matchesNone, match } = await buildBillPredicate(ctx, args);
    if (matchesNone) return { data: [], hasMore: false };

    const needed = offset + limit + 1;
    const matches: Doc<"bills">[] = [];
    let scanned = 0;

    const iter =
      args.progressStage !== undefined
        ? ctx.db
            .query("bills")
            .withIndex("by_congress_and_progress_stage", (q) =>
              q
                .eq("congress", congressFilter)
                .eq("progressStage", args.progressStage),
            )
            .order("desc")
        : ctx.db
            .query("bills")
            .withIndex("by_congress", (q) => q.eq("congress", congressFilter))
            .order("desc");

    for await (const bill of iter) {
      scanned++;
      if (!match(bill)) {
        if (scanned >= MAX_LIST_SCAN) break;
        continue;
      }
      matches.push(bill);
      if (matches.length >= needed) break;
      if (scanned >= MAX_LIST_SCAN) break;
    }

    if (scanned >= MAX_LIST_SCAN && matches.length <= offset + limit) {
      console.warn("bills.list hit scan cap before filling page", {
        congress: congressFilter,
        filters: {
          progressStage: args.progressStage ?? null,
          sponsorState: args.sponsorState ?? null,
          billType: args.billType ?? null,
          hasTitleFilter: Boolean(args.titleFilter?.trim()),
          sponsorFilterCount: args.sponsorFilter?.length ?? 0,
          billNumber: args.billNumber ?? null,
          policyArea: args.policyArea ?? null,
          introducedDateFilter: args.introducedDateFilter ?? null,
          lastActionDateFilter: args.lastActionDateFilter ?? null,
        },
        offset,
        limit,
        matches: matches.length,
        scanned,
      });
    }

    const hasMore = matches.length > offset + limit;
    const page = matches.slice(offset, offset + limit);

    // Enrich each bill with its policy area (parallel indexed lookups).
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
      }),
    );

    return { data: enrichedPage, hasMore };
  },
});

/**
 * Exact count of bills matching filters when we can answer from precomputed
 * tables or aggregate components.
 *
 * Complex filter combinations return `{ count: null, exact: false }` instead
 * of scanning an entire congress and tripping Convex's read limit.
 */
export const listCount = query({
  args: BILLS_FILTER_ARGS,
  handler: async (ctx, args) => {
    validatePublicFilters(args);
    const congressFilter = await resolveCongress(ctx, args.congress);
    if (congressFilter === null) return { count: 0, exact: true };

    const activeFilters = [
      args.progressStage !== undefined,
      args.sponsorState !== undefined,
      args.billType !== undefined,
      args.titleFilter !== undefined && args.titleFilter.trim() !== "",
      args.sponsorFilter !== undefined && args.sponsorFilter.length > 0,
      args.billNumber !== undefined && args.billNumber.trim() !== "",
      args.policyArea !== undefined,
      args.introducedDateFilter !== undefined && args.introducedDateFilter !== "all",
      args.lastActionDateFilter !== undefined && args.lastActionDateFilter !== "all",
    ].filter(Boolean).length;

    if (activeFilters === 0) {
      const stats = await ctx.db
        .query("congressStats")
        .withIndex("by_congress", (q) => q.eq("congress", congressFilter))
        .first();
      if (stats) return { count: stats.totalCount, exact: true };

      const ns = { namespace: congressFilter };
      const [houseCount, senateCount] = await billsByChamber.countBatch(ctx, [
        {
          ...ns,
          bounds: {
            lower: { key: "h", inclusive: true },
            upper: { key: "i", inclusive: false },
          },
        },
        {
          ...ns,
          bounds: {
            lower: { key: "s", inclusive: true },
            upper: { key: "t", inclusive: false },
          },
        },
      ]);
      if (houseCount + senateCount === 0) {
        const bill = await ctx.db
          .query("bills")
          .withIndex("by_congress", (q) => q.eq("congress", congressFilter))
          .first();
        if (bill) return unknownCount();
      }
      return { count: houseCount + senateCount, exact: true };
    }

    if (activeFilters === 1 && args.billType !== undefined) {
      const [count] = await billsByChamber.countBatch(ctx, [
        {
          namespace: congressFilter,
          bounds: { eq: args.billType },
        },
      ]);
      return { count, exact: true };
    }

    if (activeFilters === 1 && args.progressStage !== undefined) {
      const [count] = await billsByStage.countBatch(ctx, [
        {
          namespace: congressFilter,
          bounds: { eq: args.progressStage },
        },
      ]);
      return { count, exact: true };
    }

    if (activeFilters === 1 && args.policyArea !== undefined) {
      const rows = await ctx.db
        .query("congressPolicyAreas")
        .withIndex("by_congress", (q) => q.eq("congress", congressFilter))
        .take(1000);
      if (rows.length === 0) return unknownCount();
      const match = rows.find((r) => r.policyAreaName === args.policyArea);
      return { count: match?.count ?? 0, exact: true };
    }

    if (
      activeFilters === 1 &&
      args.sponsorFilter &&
      args.sponsorFilter.length > 0
    ) {
      const wanted = new Set(args.sponsorFilter.map(normaliseName));
      const rows = await ctx.db
        .query("congressSponsors")
        .withIndex("by_congress", (q) => q.eq("congress", congressFilter))
        .take(10000);
      if (rows.length === 0) return unknownCount();
      const count = rows.reduce((total, row) => {
        return wanted.has(normaliseName(row.sponsorName))
          ? total + row.billCount
          : total;
      }, 0);
      return { count, exact: true };
    }

    if (activeFilters === 1 && args.sponsorState !== undefined) {
      const [house, senate] = await Promise.all([
        ctx.db
          .query("congressChamberBreakdowns")
          .withIndex("by_congress_and_chamber", (q) =>
            q.eq("congress", congressFilter).eq("chamber", "house"),
          )
          .first(),
        ctx.db
          .query("congressChamberBreakdowns")
          .withIndex("by_congress_and_chamber", (q) =>
            q.eq("congress", congressFilter).eq("chamber", "senate"),
          )
          .first(),
      ]);
      if (!house && !senate) return unknownCount();
      const countForState = (rows: Array<{ state: string; count: number }>) =>
        rows.find((r) => r.state === args.sponsorState)?.count ?? 0;
      return {
        count:
          countForState(house?.stateCounts ?? []) +
          countForState(senate?.stateCounts ?? []),
        exact: true,
      };
    }

    return unknownCount();
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
 * Every unique sponsor across every congress, deduped by full name.
 * Powers the sponsor dropdown on /bills. Party / state / billCount come from
 * the row with the highest bill count for that name (so a member who served
 * in multiple congresses is represented by their most-active record).
 */
export const listAllSponsors = query({
  handler: async (ctx) => {
    const rows = await ctx.db.query("congressSponsors").collect();

    const byName = new Map<
      string,
      { name: string; party?: string; state?: string; billCount: number }
    >();
    for (const r of rows) {
      const existing = byName.get(r.sponsorName);
      if (!existing) {
        byName.set(r.sponsorName, {
          name: r.sponsorName,
          party: r.sponsorParty,
          state: r.sponsorState,
          billCount: r.billCount,
        });
        continue;
      }
      existing.billCount += r.billCount;
      // Keep the latest non-empty party/state we see.
      if (!existing.party && r.sponsorParty) existing.party = r.sponsorParty;
      if (!existing.state && r.sponsorState) existing.state = r.sponsorState;
    }

    return [...byName.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" })
    );
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
 * Cursor-paginated feed of every bill in a congress, for sitemap generation.
 * Returns only billId + updatedAt (~17-20k bills per congress, so the sitemap
 * route loops pages of 2,500 to stay well under per-query read limits). The
 * general `list` query is unusable here — it caps offset at 500 by design.
 */
export const listForSitemap = query({
  args: {
    congress: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", args.congress))
      .paginate(args.paginationOpts);
    return {
      page: result.page.map((b) => ({
        billId: b.billId,
        updatedAt: b.updatedAt,
      })),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
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
    const rows = await ctx.db.query("congressPolicyAreas").take(1000);
    const areas = [
      ...new Set(
        rows.map((s) => s.policyAreaName).filter((a): a is string => !!a)
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

/**
 * Per-chamber deep breakdown for one Congress (party / state / monthly).
 *
 * Reads a single precomputed row from `congressChamberBreakdowns` —
 * populated by `recomputeCongressChamberBreakdown` after each sync and by
 * the daily 4 AM stats cron. Replaces a previous implementation that
 * scanned 6-7K bill documents per call, which dominated homepage cold-load
 * latency.
 *
 * Returns an empty-shape response if the precomputed row hasn't been
 * built yet — the homepage tolerates zero counts.
 */
export const getChamberDeepBreakdown = query({
  args: {
    congress: v.number(),
    chamber: v.union(v.literal("house"), v.literal("senate")),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("congressChamberBreakdowns")
      .withIndex("by_congress_and_chamber", (q) =>
        q.eq("congress", args.congress).eq("chamber", args.chamber),
      )
      .unique();

    if (!row) {
      return {
        chamber: args.chamber,
        total: 0,
        partyCounts: { D: 0, R: 0, I: 0, U: 0 } as Record<
          "D" | "R" | "I" | "U",
          number
        >,
        partyLawCounts: { D: 0, R: 0, I: 0, U: 0 } as Record<
          "D" | "R" | "I" | "U",
          number
        >,
        stateCounts: {} as Record<string, number>,
        monthly: [] as Array<{
          month: string;
          count: number;
          becameLaw: number;
        }>,
      };
    }

    return {
      chamber: args.chamber,
      total: row.total,
      partyCounts: row.partyCounts,
      partyLawCounts: row.partyLawCounts,
      stateCounts: Object.fromEntries(
        row.stateCounts.map((s) => [s.state, s.count]),
      ),
      monthly: row.monthly,
    };
  },
});
