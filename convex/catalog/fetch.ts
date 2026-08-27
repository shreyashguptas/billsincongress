/**
 * The whitelisted fetch handlers (spec §4.4).
 *
 * The model never writes a query. It names a dataset and passes filters, and
 * this file decides — with our indexes, our caps, our ordering — what comes
 * back. Adding a dataset means adding a case here and an entry in datasets.ts.
 *
 * Every row is minted a provenance handle so the answer can cite it and the
 * server can verify that citation later (see cite.ts).
 */
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { isDatasetName } from "./datasets";
import { validateFilters } from "./filters";
import { mintHandle } from "./cite";
import { sanitizeSearchQuery } from "../searchQuery";
import type { DatasetName } from "./types";

/** Default rows per fetch. Small on purpose — context is the scarce resource. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** How many rows we scan before filtering in memory. */
const SCAN_LIMIT = 200;
/** Distinct sponsor surnames looked up per call, so one request stays bounded. */
const MAX_SPONSOR_LOOKUPS = 10;

type Row = Record<string, unknown>;
type FetchResult =
  | {
      ok: true;
      rows: Row[];
      truncated: boolean;
      count: number;
      /**
       * True when the scan hit its window, so `count` is a FLOOR rather than a
       * total. Surfaced to the model as `total_is_at_least` so it never states
       * a capped scan's count as if it were the real number.
       */
      countIsLowerBound?: boolean;
    }
  | { ok: false; error: string };

export const fetchDataset = internalQuery({
  args: {
    name: v.string(),
    // Shape is validated by validateFilters against the catalog, which gives
    // the model a recoverable error rather than a Convex argument rejection.
    filters: v.any(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<FetchResult> => {
    if (!isDatasetName(args.name)) {
      return {
        ok: false,
        error: `Unknown dataset '${args.name}'. See the dataset index in your instructions.`,
      };
    }
    const validated = validateFilters(args.name, args.filters ?? {});
    if (!validated.ok) return { ok: false, error: validated.error };

    const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const f = validated.filters;

    switch (args.name as DatasetName) {
      case "bills":
        return await fetchBills(ctx, f, limit);
      case "bill_actions":
        return await fetchActions(ctx, f, limit);
      case "bill_summaries":
        return await fetchSummaries(ctx, f, limit);
      case "topics":
        return await fetchTopics(ctx, f, limit);
      case "sponsors":
        return await fetchSponsors(ctx, f, limit);
      case "stats":
        return await fetchStats(ctx, f);
    }
  },
});

const HOUSE_TYPES = ["hr", "hjres", "hconres", "hres"];
const SENATE_TYPES = ["s", "sjres", "sconres", "sres"];

async function fetchBills(ctx: QueryCtx, f: Row, limit: number): Promise<FetchResult> {
  const congress = (f.congress as number) ?? 119;
  const title = typeof f.titleFilter === "string" ? sanitizeSearchQuery(f.titleFilter) : "";
  const sponsorNames = Array.isArray(f.sponsorFilter) ? (f.sponsorFilter as string[]) : null;

  // Pick the most selective index available for this filter set. Order matters:
  // every filter NOT enforced by the chosen index has to be applied in memory
  // over a capped window, and anything outside that window is invisible.
  //
  // Each branch is responsible for saying whether it saw everything it should
  // have. Getting this wrong in the optimistic direction is how a sample gets
  // reported to a reader as a total.
  let candidates;
  let scanCapped = false;
  /** The sponsor branch computes its own capping, per surname. */
  let sponsorBranch = false;
  if (title !== "") {
    candidates = await ctx.db
      .query("bills")
      .withSearchIndex("search_title", (q) => {
        let s = q.search("title", title).eq("congress", congress);
        if (typeof f.billType === "string") s = s.eq("billType", f.billType);
        if (typeof f.progressStage === "number") s = s.eq("progressStage", f.progressStage);
        if (typeof f.sponsorState === "string") s = s.eq("sponsorState", f.sponsorState);
        return s;
      })
      .take(SCAN_LIMIT);
  } else if (typeof f.policyArea === "string") {
    candidates = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_policy_area", (q) =>
        q.eq("congress", congress).eq("policyAreaName", f.policyArea as string),
      )
      .order("desc")
      .take(SCAN_LIMIT);
  } else if (sponsorNames && sponsorNames.length > 0) {
    // Query by LAST name through the index, then match the full name in memory.
    // The alternative — scanning the newest 200 bills and hoping this sponsor's
    // work is among them — returns a near-random subset of what they filed.
    const allLastNames = [
      ...new Set(
        sponsorNames
          .map((n) => n.trim().split(/\s+/).slice(-1)[0])
          .filter((n) => n.length > 0),
      ),
    ];
    const lastNames = allLastNames.slice(0, MAX_SPONSOR_LOOKUPS);
    const perName = await Promise.all(
      lastNames.map((last) =>
        ctx.db
          .query("bills")
          .withIndex("by_congress_and_sponsor_last", (q) =>
            q.eq("congress", congress).eq("sponsorLastName", last),
          )
          .order("desc")
          .take(SCAN_LIMIT),
      ),
    );
    candidates = perName.flat();
    sponsorBranch = true;
    // Capped if ANY single surname filled its own window — not if the names
    // merely sum past it, which would over-report truncation for three
    // complete 70-row lookups. Also capped if we declined to look up some of
    // the names at all: searching 10 of 15 and reporting the result as
    // complete is the same silent-sample bug in a different costume.
    scanCapped =
      perName.some((rows) => rows.length >= SCAN_LIMIT) ||
      allLastNames.length > lastNames.length;
  } else if (typeof f.sponsorState === "string") {
    candidates = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_sponsor_state", (q) =>
        q.eq("congress", congress).eq("sponsorState", f.sponsorState as string),
      )
      .order("desc")
      .take(SCAN_LIMIT);
  } else if (typeof f.progressStage === "number") {
    candidates = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_progress_stage", (q) =>
        q.eq("congress", congress).eq("progressStage", f.progressStage as number),
      )
      .order("desc")
      .take(SCAN_LIMIT);
  } else if (typeof f.billType === "string") {
    candidates = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_type", (q) =>
        q.eq("congress", congress).eq("billType", f.billType as string),
      )
      .order("desc")
      .take(SCAN_LIMIT);
  } else if (typeof f.billNumber === "string") {
    candidates = await ctx.db
      .query("bills")
      .withIndex("by_congress_and_bill_number", (q) =>
        q.eq("congress", congress).eq("billNumber", f.billNumber as string),
      )
      .take(SCAN_LIMIT);
  } else {
    candidates = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", congress))
      .order("desc")
      .take(SCAN_LIMIT);
  }

  /**
   * Did we read all the way to the end of the window?
   *
   * If so there are almost certainly rows we never looked at, and any count
   * derived from `matched` is a FLOOR, not a total. Reporting `truncated:false`
   * here would tell the model its partial answer was complete — the exact way a
   * capped scan turns into a confident falsehood.
   *
   * The sponsor branch sets this itself, per-surname; every other branch is a
   * single query, so filling the window is the signal.
   */
  // Deliberately NOT `scanCapped || candidates.length >= SCAN_LIMIT`: the
  // sponsor branch concatenates several complete per-surname results, which can
  // sum past the limit without any single query having been capped.
  if (!sponsorBranch) scanCapped = candidates.length >= SCAN_LIMIT;

  const sponsors = sponsorNames
    ? new Set(sponsorNames.map((s) => s.trim().toLowerCase()))
    : null;
  const chamberTypes =
    f.chamber === "house" ? HOUSE_TYPES : f.chamber === "senate" ? SENATE_TYPES : null;

  const matched = candidates.filter((b) => {
    if (typeof f.progressStage === "number" && b.progressStage !== f.progressStage) return false;
    if (typeof f.sponsorState === "string" && b.sponsorState !== f.sponsorState) return false;
    if (typeof f.billType === "string" && b.billType !== f.billType) return false;
    if (typeof f.billNumber === "string" && b.billNumber !== f.billNumber) return false;
    if (typeof f.policyArea === "string" && b.policyAreaName !== f.policyArea) return false;
    if (chamberTypes && !chamberTypes.includes(b.billType)) return false;
    if (sponsors) {
      const full = `${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`.trim().toLowerCase();
      if (!sponsors.has(full)) return false;
    }
    return true;
  });

  const rows = matched.slice(0, limit).map((b) => ({
    _cite: mintHandle("bills", b.billId),
    billId: b.billId,
    label: `${b.billTypeLabel} ${b.billNumber}`,
    title: b.title,
    congress: b.congress,
    introducedDate: b.introducedDate,
    sponsor: `${b.sponsorFirstName ?? ""} ${b.sponsorLastName ?? ""}`.trim(),
    sponsorParty: b.sponsorParty ?? "",
    sponsorState: b.sponsorState ?? "",
    progressStage: b.progressStage ?? 20,
    policyArea: b.policyAreaName ?? "",
    latestActionDate: b.latestActionDate ?? "",
  }));

  return {
    ok: true,
    rows,
    truncated: scanCapped || matched.length > rows.length,
    count: matched.length,
    countIsLowerBound: scanCapped,
  };
}

async function fetchActions(ctx: QueryCtx, f: Row, limit: number): Promise<FetchResult> {
  const all = await ctx.db
    .query("billActions")
    .withIndex("by_billId", (q) => q.eq("billId", f.billId as string))
    .collect();
  const sorted = all.sort((a, b) => a.actionDate.localeCompare(b.actionDate));
  const rows = sorted.slice(-limit).map((a, i) => ({
    _cite: mintHandle("bill_actions", `${f.billId as string}:${i}`),
    billId: a.billId,
    date: a.actionDate,
    text: a.text,
    type: a.type ?? "",
  }));
  return { ok: true, rows, truncated: sorted.length > rows.length, count: sorted.length };
}

async function fetchSummaries(ctx: QueryCtx, f: Row, limit: number): Promise<FetchResult> {
  const all = await ctx.db
    .query("billSummaries")
    .withIndex("by_billId", (q) => q.eq("billId", f.billId as string))
    .take(20);
  const sorted = all.sort((a, b) => b.updateDate.localeCompare(a.updateDate));
  const rows = sorted.slice(0, limit).map((s) => ({
    _cite: mintHandle("bill_summaries", `${s.billId}:${s.updateDate}`),
    billId: s.billId,
    text: s.text,
    describes: s.actionDesc ?? "",
    updateDate: s.updateDate,
  }));
  return { ok: true, rows, truncated: sorted.length > rows.length, count: sorted.length };
}

async function fetchTopics(ctx: QueryCtx, f: Row, limit: number): Promise<FetchResult> {
  const congress = (f.congress as number) ?? 119;
  const all = await ctx.db
    .query("congressPolicyAreas")
    .withIndex("by_congress", (q) => q.eq("congress", congress))
    .take(SCAN_LIMIT);
  const sorted = all.sort((a, b) => b.count - a.count);
  const rows = sorted.slice(0, limit).map((t) => ({
    _cite: mintHandle("topics", `${congress}:${t.policyAreaName}`),
    policyAreaName: t.policyAreaName,
    count: t.count,
    congress,
  }));
  return { ok: true, rows, truncated: sorted.length > rows.length, count: sorted.length };
}

async function fetchSponsors(ctx: QueryCtx, f: Row, limit: number): Promise<FetchResult> {
  const congress = (f.congress as number) ?? 119;
  const all = await ctx.db
    .query("congressSponsors")
    .withIndex("by_congress_and_count", (q) => q.eq("congress", congress))
    .order("desc")
    .take(300);
  const filtered =
    typeof f.sponsorState === "string"
      ? all.filter((s) => s.sponsorState === f.sponsorState)
      : all;
  const rows = filtered.slice(0, limit).map((s) => ({
    _cite: mintHandle("sponsors", `${congress}:${s.sponsorName}`),
    sponsorName: s.sponsorName,
    billCount: s.billCount,
    sponsorParty: s.sponsorParty ?? "",
    sponsorState: s.sponsorState ?? "",
    congress,
  }));
  return { ok: true, rows, truncated: filtered.length > rows.length, count: filtered.length };
}

async function fetchStats(ctx: QueryCtx, f: Row): Promise<FetchResult> {
  const congress = (f.congress as number) ?? 119;
  const stats = await ctx.db
    .query("congressStats")
    .withIndex("by_congress", (q) => q.eq("congress", congress))
    .first();
  if (!stats) {
    return { ok: true, rows: [], truncated: false, count: 0 };
  }

  const row: Row = {
    _cite: mintHandle("stats", String(congress)),
    congress,
    totalCount: stats.totalCount,
    houseCount: stats.houseCount,
    senateCount: stats.senateCount,
    stageCounts: stats.stageCounts,
  };

  if (f.chamber === "house" || f.chamber === "senate") {
    const breakdown = await ctx.db
      .query("congressChamberBreakdowns")
      .withIndex("by_congress_and_chamber", (q) =>
        q.eq("congress", congress).eq("chamber", f.chamber as "house" | "senate"),
      )
      .first();
    if (breakdown) {
      row._cite = mintHandle("stats", `${congress}:${f.chamber as string}`);
      row.chamber = f.chamber;
      row.chamberTotal = breakdown.total;
      row.partyCounts = breakdown.partyCounts;
      row.partyLawCounts = breakdown.partyLawCounts;
    }
  }

  return { ok: true, rows: [row], truncated: false, count: 1 };
}
