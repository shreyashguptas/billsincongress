/**
 * The whitelisted fetch handlers (spec §4.4). The model never writes a query: it
 * names a dataset and passes filters, and this file decides — with our indexes,
 * caps and ordering — what comes back. Every row is minted a provenance handle so
 * the answer can cite it and the server can verify that citation later (cite.ts).
 *
 * READ convex/catalog/completeness.ts BEFORE CHANGING ANYTHING HERE.
 *
 * Every handler returns a CompletenessReport alongside its rows, and the rule it
 * encodes is the whole point of this file: a total is emitted ONLY when we read
 * the entire set. The previous shape — `truncated` plus a bare `count` — caused
 * every accuracy defect found in the 2026-08-30 audit, because `count` was
 * whatever survived an in-memory filter over a capped window and the model read
 * it as a census. "104 House bills became law" (it is 64), "Tom McClintock
 * introduced the fewest bills in California" (25 of 54 members were invisible),
 * "we don't have data on Texas bills that became law" (eleven had). None of those
 * were model errors. They were this file promising more than it had read.
 *
 * Three invariants, all enforced below and all tested in
 * scripts/truth/handlers.test.ts against a local copy of production:
 *   1. No total without a complete read.
 *   2. No claimed ORDER unless an index guarantees it or we hold the whole set.
 *   3. A filter the index cannot enforce makes the read incomplete, full stop.
 */
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { isDatasetName } from "./datasets";
import { validateFilters } from "./filters";
import { mintHandle } from "./cite";
import { sanitizeSearchQuery } from "../searchQuery";
import type { DatasetName } from "./types";
import { chooseBillsIndex, countInMemoryFilters } from "./billsIndex";
import {
  completeReport,
  reportFor,
  type CompletenessReport,
  type RowOrder,
} from "./completeness";
import { milestoneStages } from "./stageSemantics";
import { canBecomeLaw, measureNoun } from "./measureType";
import { matchesFullName, resolveSurname } from "./sponsorName";

/** Default rows per fetch. Small on purpose — context is the scarce resource. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/**
 * How many rows we examine before giving up on completeness.
 *
 * Raised from 200 because the window size decides how often we can answer at all:
 * under the completeness contract a filled window means "no total, no ranking, no
 * 'none'", so a small window converts answerable questions into refusals. 1,000
 * is in line with the site's own MAX_LIST_SCAN of 1,200.
 */
const SCAN_LIMIT = 1000;
/**
 * Ceiling for count-only reads (`limit: 0`), which ship no rows and so cost the
 * model's context nothing.
 *
 * Sized against two things. It must clear the largest policy area (~2,100 bills)
 * so per-topic and per-state breakdowns come back exact rather than merely
 * honest. And it must stay well inside Convex's per-query read limit of 8 MiB:
 * a bill row averages 728 bytes measured over all 55,619 rows, so 5,000 rows is
 * ~3.5 MB. Exceeding that limit is a hard query failure that loses the whole
 * answer, which is strictly worse than returning `complete: false`.
 */
const COUNT_SCAN_LIMIT = 5000;
/** Distinct sponsor surnames looked up per call, so one request stays bounded. */
const MAX_SPONSOR_LOOKUPS = 10;
/** Sponsors per Congress is ~550, so the whole set is readable in one go. */
const SPONSOR_SCAN_LIMIT = 2000;

type Row = Record<string, unknown>;
type FetchResult =
  | { ok: true; rows: Row[]; report: CompletenessReport }
  | { ok: false; error: string };

/**
 * The dispatcher, exported so tests can drive the real handlers against a local
 * copy of production without a deployment (scripts/truth/handlers.test.ts).
 *
 * Kept separate from the `internalQuery` wrapper on purpose: reaching into that
 * wrapper's private `_handler` field worked, but it is Convex's internal API and
 * would break silently on an upgrade — leaving the accuracy tests passing while
 * testing nothing.
 */
export async function runFetch(
  ctx: QueryCtx,
  args: { name: string; filters: unknown; limit?: number },
): Promise<FetchResult> {
  {
    if (!isDatasetName(args.name)) {
      return {
        ok: false,
        error: `Unknown dataset '${args.name}'. See the dataset index in your instructions.`,
      };
    }
    const validated = validateFilters(args.name, args.filters ?? {});
    if (!validated.ok) return { ok: false, error: validated.error };

    // limit 0 is COUNT ONLY: no rows, a bigger window, an exact total where one
    // is reachable. This is how a breakdown across 30 categories is built without
    // 30 pages of rows crowding out the answer.
    const countOnly = args.limit === 0;
    const limit = countOnly
      ? 0
      : Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const f = validated.filters;

    switch (args.name as DatasetName) {
      case "bills":
        return await fetchBills(ctx, f, limit, countOnly);
      case "bill_actions":
        return await fetchActions(ctx, f, limit || MAX_LIMIT);
      case "bill_summaries":
        return await fetchSummaries(ctx, f, limit || MAX_LIMIT);
      case "topics":
        return await fetchTopics(ctx, f);
      case "sponsors":
        return await fetchSponsors(ctx, f, limit, countOnly);
      case "stats":
        return await fetchStats(ctx, f);
    }
  }
}

export const fetchDataset = internalQuery({
  args: {
    name: v.string(),
    // Shape is validated by validateFilters against the catalog, which gives
    // the model a recoverable error rather than a Convex argument rejection.
    filters: v.any(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<FetchResult> => runFetch(ctx, args),
});

const HOUSE_TYPES = ["hr", "hjres", "hconres", "hres"];
const SENATE_TYPES = ["s", "sjres", "sconres", "sres"];

/**
 * Sort keys the `bills` dataset accepts. `key` reads the value off a row rather
 * than naming a field as a string, so a renamed column is a compile error here
 * instead of a silent "everything sorts equal" at runtime.
 */
type BillSortRow = { latestActionDate?: string; introducedDate?: string };
const SORT_FIELD: Record<
  string,
  { key: (b: BillSortRow) => string; direction: "asc" | "desc"; order: RowOrder }
> = {
  newest_action: {
    key: (b) => b.latestActionDate ?? "",
    direction: "desc",
    order: "newest_action_first",
  },
  oldest_action: {
    key: (b) => b.latestActionDate ?? "",
    direction: "asc",
    order: "oldest_action_first",
  },
  newest_introduced: {
    key: (b) => b.introducedDate ?? "",
    direction: "desc",
    order: "newest_introduced_first",
  },
  oldest_introduced: {
    key: (b) => b.introducedDate ?? "",
    direction: "asc",
    order: "oldest_introduced_first",
  },
};

/** Plain-English description of the set a bills fetch drew from. */
function describeBillSet(f: Row): string {
  const parts: string[] = [];
  if (typeof f.billId === "string") return `the single bill ${f.billId}`;
  if (typeof f.policyArea === "string") parts.push(`policy area '${f.policyArea}'`);
  if (typeof f.progressStage === "number") parts.push(`terminal stage ${f.progressStage}`);
  if (typeof f.reachedStage === "number") parts.push(`having reached stage ${f.reachedStage}`);
  if (typeof f.sponsorState === "string") parts.push(`sponsored from ${f.sponsorState}`);
  if (Array.isArray(f.sponsorFilter)) parts.push(`sponsored by ${(f.sponsorFilter as string[]).join(", ")}`);
  if (typeof f.chamber === "string") parts.push(`originating in the ${f.chamber}`);
  if (typeof f.billType === "string") parts.push(`of type ${f.billType}`);
  if (typeof f.titleFilter === "string") parts.push(`with '${f.titleFilter}' in the title`);
  if (typeof f.introducedAfter === "string") parts.push(`introduced on or after ${f.introducedAfter}`);
  if (typeof f.introducedBefore === "string") parts.push(`introduced on or before ${f.introducedBefore}`);
  if (typeof f.actionAfter === "string") parts.push(`last acted on or after ${f.actionAfter}`);
  if (typeof f.actionBefore === "string") parts.push(`last acted on or before ${f.actionBefore}`);
  const congress = (f.congress as number) ?? 119;
  const where = parts.length > 0 ? ` ${parts.join(", ")}` : "";
  return `every measure in the ${congress}th Congress${where}`;
}

async function fetchBills(
  ctx: QueryCtx,
  f: Row,
  limit: number,
  countOnly: boolean,
): Promise<FetchResult> {
  const congress = (f.congress as number) ?? 119;
  const title = typeof f.titleFilter === "string" ? sanitizeSearchQuery(f.titleFilter) : "";
  const sponsorNames = Array.isArray(f.sponsorFilter) ? (f.sponsorFilter as string[]) : null;
  const ceiling = countOnly ? COUNT_SCAN_LIMIT : SCAN_LIMIT;

  // The index choice is a correctness argument, not an optimisation, and it lives
  // in a tested module precisely because two production incidents came from
  // getting the ordering of these branches wrong. See billsIndex.ts.
  const plan = chooseBillsIndex(f);

  let candidates;
  let windowFilled = false;
  /**
   * Set by branches that read several index ranges and therefore compute their
   * own capping — the sponsor-surname branch and the milestone branch. Their
   * concatenated results can exceed the ceiling without any single read having
   * been capped, so the generic check below must not overwrite them.
   */
  let ownCapping = false;

  switch (plan.branch) {
    case "billId":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_billId", (q) => q.eq("billId", f.billId as string))
        .take(1);
      break;
    case "titleSearch":
      candidates = await ctx.db
        .query("bills")
        .withSearchIndex("search_title", (q) => {
          let s = q.search("title", title).eq("congress", congress);
          if (typeof f.billType === "string") s = s.eq("billType", f.billType);
          if (typeof f.progressStage === "number") s = s.eq("progressStage", f.progressStage);
          if (typeof f.sponsorState === "string") s = s.eq("sponsorState", f.sponsorState);
          return s;
        })
        .take(ceiling);
      break;
    case "billNumber":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_congress_and_bill_number", (q) =>
          q.eq("congress", congress).eq("billNumber", f.billNumber as string),
        )
        .take(ceiling);
      break;
    case "policyAreaAndStage":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_congress_policy_area_and_stage", (q) =>
          q
            .eq("congress", congress)
            .eq("policyAreaName", f.policyArea as string)
            .eq("progressStage", f.progressStage as number),
        )
        .order("desc")
        .take(ceiling);
      break;
    case "policyArea":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_congress_and_policy_area", (q) =>
          q.eq("congress", congress).eq("policyAreaName", f.policyArea as string),
        )
        .order("desc")
        .take(ceiling);
      break;
    case "sponsorStateAndStage":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_congress_state_and_stage", (q) =>
          q
            .eq("congress", congress)
            .eq("sponsorState", f.sponsorState as string)
            .eq("progressStage", f.progressStage as number),
        )
        .order("desc")
        .take(ceiling);
      break;
    case "sponsorNames": {
      // Query by LAST name through the index, then match the full name in memory.
      // Surnames are RESOLVED against what we actually store rather than guessed
      // from the last word — guessing reported every member with a two-word
      // surname, Monica De La Cruz and Jeff Van Drew among them, as having
      // introduced nothing at all.
      const known = await knownSurnames(ctx, congress);
      const resolved = (sponsorNames ?? [])
        .map((n) => resolveSurname(n, known))
        .filter((s): s is string => s !== null);
      const allLastNames = [...new Set(resolved)];
      const lastNames = allLastNames.slice(0, MAX_SPONSOR_LOOKUPS);
      const perName = await Promise.all(
        lastNames.map((last) =>
          ctx.db
            .query("bills")
            .withIndex("by_congress_and_sponsor_last", (q) =>
              q.eq("congress", congress).eq("sponsorLastName", last),
            )
            .order("desc")
            .take(ceiling),
        ),
      );
      candidates = perName.flat();
      ownCapping = true;
      // Capped if ANY single surname filled its own window — not if the names
      // merely sum past it — or if we declined to look some of them up.
      //
      // ALSO capped when we could not resolve a single requested name. Without
      // this, an unrecognised spelling would return "complete, total 0", which
      // states as fact that a sitting member has introduced nothing — the exact
      // falsehood this branch was rewritten to stop. The same applies if we hold
      // no sponsor roster for the Congress at all: not knowing is not zero.
      windowFilled =
        (allLastNames.length === 0 && (sponsorNames?.length ?? 0) > 0) ||
        known.size === 0 ||
        perName.some((rows) => rows.length >= ceiling) ||
        allLastNames.length > lastNames.length;
      break;
    }
    case "reachedStage": {
      // Union of the terminal stage buckets that satisfy the milestone. Read
      // per-bucket rather than scanning a whole chamber: the buckets are small
      // and complete, where a chamber scan comes back capped and therefore
      // unanswerable. Each bucket gets the FULL ceiling, so one large bucket
      // cannot silently starve the others.
      const stages = milestoneStages(f.reachedStage as number);
      const perStage = await Promise.all(
        stages.map((stage) =>
          ctx.db
            .query("bills")
            .withIndex("by_congress_and_progress_stage", (q) =>
              q.eq("congress", congress).eq("progressStage", stage),
            )
            .order("desc")
            .take(ceiling),
        ),
      );
      candidates = perStage.flat();
      ownCapping = true;
      windowFilled = perStage.some((rows) => rows.length >= ceiling);
      break;
    }
    case "sponsorState":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_congress_and_sponsor_state", (q) =>
          q.eq("congress", congress).eq("sponsorState", f.sponsorState as string),
        )
        .order("desc")
        .take(ceiling);
      break;
    case "progressStage":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_congress_and_progress_stage", (q) =>
          q.eq("congress", congress).eq("progressStage", f.progressStage as number),
        )
        .order("desc")
        .take(ceiling);
      break;
    case "billType":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_congress_and_type", (q) =>
          q.eq("congress", congress).eq("billType", f.billType as string),
        )
        .order("desc")
        .take(ceiling);
      break;
    case "congress":
      candidates = await ctx.db
        .query("bills")
        .withIndex("by_congress", (q) => q.eq("congress", congress))
        .order("desc")
        .take(ceiling);
      break;
    default:
      // Every BillsBranch is handled above. A branch added to billsIndex.ts
      // without a query here is a bug, not a fallback.
      throw new Error(`Unhandled bills index branch: ${plan.branch}`);
  }

  // Reading to the end of the window means rows exist we never looked at, so
  // nothing derived from `matched` can be called a total.
  if (!ownCapping) windowFilled = candidates.length >= ceiling;

  const requestedSurnames = sponsorNames;
  const chamberTypes =
    f.chamber === "house" ? HOUSE_TYPES : f.chamber === "senate" ? SENATE_TYPES : null;
  const reachedSet =
    typeof f.reachedStage === "number" ? new Set(milestoneStages(f.reachedStage)) : null;

  const matched = candidates.filter((b) => {
    if (typeof f.billId === "string" && b.billId !== f.billId) return false;
    // A no-op for every other branch, where the index already pinned the
    // Congress. It matters only for the billId branch, which does not — so a
    // {billId, congress} pair that disagrees returns nothing rather than
    // returning the bill and letting the answer assert the wrong Congress.
    if (typeof f.congress === "number" && b.congress !== f.congress) return false;
    if (typeof f.progressStage === "number" && b.progressStage !== f.progressStage) return false;
    // reachedStage is a MILESTONE, not a bucket: "passed the Senate" includes
    // every bill that went further. Counting the terminal bucket answered "how
    // many bills has the Senate passed" with a number that omitted all 104 laws.
    if (reachedSet && !reachedSet.has(b.progressStage ?? 20)) return false;
    if (typeof f.sponsorState === "string" && b.sponsorState !== f.sponsorState) return false;
    if (typeof f.billType === "string" && b.billType !== f.billType) return false;
    if (typeof f.billNumber === "string" && b.billNumber !== f.billNumber) return false;
    if (typeof f.policyArea === "string" && b.policyAreaName !== f.policyArea) return false;
    if (chamberTypes && !chamberTypes.includes(b.billType)) return false;
    if (typeof f.introducedAfter === "string" && (b.introducedDate ?? "") < f.introducedAfter) {
      return false;
    }
    if (typeof f.introducedBefore === "string" && (b.introducedDate ?? "") > f.introducedBefore) {
      return false;
    }
    if (typeof f.actionAfter === "string" && (b.latestActionDate ?? "") < f.actionAfter) {
      return false;
    }
    if (typeof f.actionBefore === "string" && (b.latestActionDate ?? "") > f.actionBefore) {
      return false;
    }
    if (requestedSurnames) {
      if (
        !requestedSurnames.some((n) =>
          matchesFullName(n, b.sponsorFirstName as string, b.sponsorLastName as string),
        )
      ) {
        return false;
      }
    }
    return true;
  });

  // ORDER. Sorting a COMPLETE set in memory is exact, so a requested sort is
  // honoured whenever the window did not fill. When it did fill we have a sample,
  // and sorting a sample and calling it "newest first" is how the assistant named
  // the third-most-recent law as the most recent. In that case the order stays
  // `arbitrary` and the contract forbids deriving a max or min from it.
  const requestedSort = typeof f.sort === "string" ? SORT_FIELD[f.sort] : undefined;
  let order: RowOrder = "arbitrary";
  let ordered = matched;
  if (requestedSort && !windowFilled) {
    ordered = [...matched].sort((a, b) => {
      const av = requestedSort.key(a);
      const bv = requestedSort.key(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return requestedSort.direction === "asc" ? cmp : -cmp;
    });
    order = requestedSort.order;
  }

  const rows = countOnly
    ? []
    : ordered.slice(0, limit).map((b) => ({
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
        // What this row actually IS. Around 2,500 measures a Congress are simple
        // or concurrent resolutions, which are not bills and can never become
        // law; calling one "a bill" in an answer is a factual error, and the
        // site has already had one incident of exactly that.
        measureType: measureNoun(b.billType),
        canBecomeLaw: canBecomeLaw(b.billType),
      }));

  return {
    ok: true,
    rows,
    report: reportFor({
      set: describeBillSet(f),
      windowFilled,
      filteredInMemory: countInMemoryFilters(f, plan) > 0,
      matchedCount: matched.length,
      shown: rows.length,
      order,
    }),
  };
}

/** Surnames we actually store for a Congress, so a full name can be resolved. */
async function knownSurnames(ctx: QueryCtx, congress: number): Promise<Set<string>> {
  const sponsors = await ctx.db
    .query("congressSponsors")
    .withIndex("by_congress", (q) => q.eq("congress", congress))
    .take(SPONSOR_SCAN_LIMIT);
  const out = new Set<string>();
  for (const s of sponsors) {
    // congressSponsors stores the full "First Last"; the surname is everything
    // after the first token, which is exactly what bills.sponsorLastName holds.
    const parts = s.sponsorName.trim().split(/\s+/);
    if (parts.length > 1) out.add(parts.slice(1).join(" "));
  }
  return out;
}

async function fetchActions(ctx: QueryCtx, f: Row, limit: number): Promise<FetchResult> {
  const billId = f.billId as string;
  const all = await ctx.db
    .query("billActions")
    .withIndex("by_billId", (q) => q.eq("billId", billId))
    .collect();

  // TRUE chronological order. Rows arrive from the Congress API newest-first, so
  // insertion order (_creationTime) descending IS the real sequence within a
  // date. Sorting on the date string alone reversed every same-day block: H.R. 1's
  // timeline read "presented to the President" BEFORE the House agreed to the
  // Senate amendment, and "became public law" before "signed by President".
  const sorted = [...all].sort((a, b) => {
    if (a.actionDate !== b.actionDate) return a.actionDate < b.actionDate ? -1 : 1;
    return b._creationTime - a._creationTime;
  });

  // Keep the OLDEST end, matching the "earliest first" contract. Taking the
  // newest slice under that contract silently deleted the House vote that passed
  // H.R. 1 from its own default timeline.
  const kept = sorted.slice(0, limit);
  const rows = kept.map((a, i) => ({
    // Handle is anchored to the ACTION, not to its position on a page. The old
    // `billId:index` form named a different action whenever the page size or the
    // sort changed, so a citation could drift off the sentence it supported.
    _cite: mintHandle("bill_actions", `${billId}:${a.actionDate}:${sameDateOrdinal(sorted, i)}`),
    billId: a.billId,
    date: a.actionDate,
    text: a.text,
    type: a.type ?? "",
  }));

  return {
    ok: true,
    rows,
    report: completeReport({
      set: `every recorded action on ${billId}`,
      total: sorted.length,
      shown: rows.length,
      order: "chronological",
    }),
  };
}

/** Position of `index` among the actions sharing its date, after stable sorting. */
function sameDateOrdinal(sorted: Array<{ actionDate: string }>, index: number): number {
  let n = 0;
  for (let i = 0; i < index; i++) {
    if (sorted[i].actionDate === sorted[index].actionDate) n++;
  }
  return n;
}

async function fetchSummaries(ctx: QueryCtx, f: Row, limit: number): Promise<FetchResult> {
  const billId = f.billId as string;
  const all = await ctx.db
    .query("billSummaries")
    .withIndex("by_billId", (q) => q.eq("billId", billId))
    .take(50);

  // One row per VERSION. CRS republishes the same version with a new updateDate,
  // and returning each copy as a separately citable row let the model present two
  // records of one summary as two summaries, and cite a superseded copy as
  // current. Newest copy of each version wins.
  const byVersion = new Map<string, (typeof all)[number]>();
  for (const s of all) {
    const key = s.actionDesc ?? "";
    const held = byVersion.get(key);
    if (!held || s.updateDate > held.updateDate) byVersion.set(key, s);
  }
  const sorted = [...byVersion.values()].sort((a, b) =>
    b.updateDate.localeCompare(a.updateDate),
  );

  const rows = sorted.slice(0, limit).map((s) => ({
    _cite: mintHandle("bill_summaries", `${s.billId}:${s.actionDesc ?? ""}`),
    billId: s.billId,
    text: s.text,
    describes: s.actionDesc ?? "",
    updateDate: s.updateDate,
  }));
  return {
    ok: true,
    rows,
    report: completeReport({
      set: `every distinct summary version of ${billId}`,
      total: sorted.length,
      shown: rows.length,
      order: "newest_first",
    }),
  };
}

async function fetchTopics(ctx: QueryCtx, f: Row): Promise<FetchResult> {
  const congress = (f.congress as number) ?? 119;
  // The whole list is ~31 rows and it is the index the model uses to find exact
  // policy-area spellings. Paging it at 20 hid a third of the topics and made
  // every per-topic breakdown silently incomplete.
  const all = await ctx.db
    .query("congressPolicyAreas")
    .withIndex("by_congress", (q) => q.eq("congress", congress))
    .collect();
  const sorted = all.sort((a, b) => b.count - a.count);
  const rows = sorted.map((t) => ({
    _cite: mintHandle("topics", `${congress}:${t.policyAreaName}`),
    policyAreaName: t.policyAreaName,
    count: t.count,
    congress,
  }));
  return {
    ok: true,
    rows,
    report: completeReport({
      set: `every policy area in the ${congress}th Congress, with its total measure count at any stage`,
      total: sorted.length,
      shown: rows.length,
      order: "largest_first",
    }),
  };
}

async function fetchSponsors(
  ctx: QueryCtx,
  f: Row,
  limit: number,
  countOnly: boolean,
): Promise<FetchResult> {
  const congress = (f.congress as number) ?? 119;
  const state = typeof f.sponsorState === "string" ? f.sponsorState : null;

  // Read the STATE through its own index rather than filtering a national
  // top-300. The old order — rank, cut, then filter — returned 29 of California's
  // 54 members flagged as the complete list, and answered "who introduced the
  // fewest bills in California" with a member who sits in the middle of the pack.
  // 250 of the 550 members of the 119th were unreachable at any page size.
  const all = state
    ? await ctx.db
        .query("congressSponsors")
        .withIndex("by_congress_and_state", (q) =>
          q.eq("congress", congress).eq("sponsorState", state),
        )
        .take(SPONSOR_SCAN_LIMIT)
    : await ctx.db
        .query("congressSponsors")
        .withIndex("by_congress", (q) => q.eq("congress", congress))
        .take(SPONSOR_SCAN_LIMIT);

  const windowFilled = all.length >= SPONSOR_SCAN_LIMIT;
  const sorted = [...all].sort((a, b) => b.billCount - a.billCount);
  const rows = countOnly
    ? []
    : sorted.slice(0, limit).map((s) => ({
        _cite: mintHandle("sponsors", `${congress}:${s.sponsorName}`),
        sponsorName: s.sponsorName,
        billCount: s.billCount,
        sponsorParty: s.sponsorParty ?? "",
        sponsorState: s.sponsorState ?? "",
        congress,
      }));

  return {
    ok: true,
    rows,
    report: reportFor({
      set: state
        ? `every member from ${state} who introduced a measure in the ${congress}th Congress`
        : `every member who introduced a measure in the ${congress}th Congress`,
      windowFilled,
      filteredInMemory: false,
      matchedCount: sorted.length,
      shown: rows.length,
      // Sorting a complete set is exact; a filled window makes the claim a lie.
      order: windowFilled ? "arbitrary" : "most_bills_first",
    }),
  };
}

/**
 * When our copy of the data was last touched by a sync, read straight off the
 * newest-updated bill. One indexed row.
 *
 * Asked "how fresh is your data?" the assistant had nothing to go on and
 * invented a freshness guarantee. It cannot answer honestly without being told.
 */
async function dataLastSynced(ctx: QueryCtx): Promise<string | null> {
  const newest = await ctx.db.query("bills").withIndex("by_updated_at").order("desc").take(1);
  return newest[0]?.updatedAt ?? null;
}

async function fetchStats(ctx: QueryCtx, f: Row): Promise<FetchResult> {
  const congress = (f.congress as number) ?? 119;
  const stats = await ctx.db
    .query("congressStats")
    .withIndex("by_congress", (q) => q.eq("congress", congress))
    .first();
  if (!stats) {
    return {
      ok: true,
      rows: [],
      report: completeReport({
        set: `precomputed totals for the ${congress}th Congress`,
        total: 0,
        shown: 0,
        order: "arbitrary",
      }),
    };
  }

  const wantsChamber = f.chamber === "house" || f.chamber === "senate";
  const lastSynced = await dataLastSynced(ctx);
  const freshness = {
    figuresLastRecomputed: stats.updatedAt,
    dataLastSynced: lastSynced,
  };

  if (!wantsChamber) {
    return {
      ok: true,
      rows: [
        {
          _cite: mintHandle("stats", String(congress)),
          congress,
          scope: "whole Congress, both chambers",
          totalMeasures: stats.totalCount,
          houseMeasures: stats.houseCount,
          senateMeasures: stats.senateCount,
          stageCounts: stats.stageCounts,
          ...freshness,
        },
      ],
      report: completeReport({
        set: `precomputed whole-Congress totals for the ${congress}th`,
        total: 1,
        shown: 1,
        order: "arbitrary",
      }),
    };
  }

  const breakdown = await ctx.db
    .query("congressChamberBreakdowns")
    .withIndex("by_congress_and_chamber", (q) =>
      q.eq("congress", congress).eq("chamber", f.chamber as "house" | "senate"),
    )
    .first();

  if (!breakdown) {
    // Refuse rather than fall back to the Congress-wide row. Returning that row
    // under a chamber-shaped question is exactly how "how many House bills became
    // law" was answered 104 instead of 64.
    return {
      ok: false,
      error:
        `We hold no per-chamber breakdown for the ${congress}th Congress, so a ` +
        `${String(f.chamber)}-only figure cannot be given. Whole-Congress totals are ` +
        `available by omitting the chamber filter — but they cover BOTH chambers and must ` +
        `not be described as one chamber's.`,
    };
  }

  // EVERY field on this row is chamber-scoped. The Congress-wide figures are
  // deliberately absent: when they rode along under a `chamber: "house"` label,
  // the model attributed the whole ladder to the House and told a reader that
  // 17,697 House bills were in committee — more than the 12,009 House measures
  // that exist, a contradiction it printed without noticing.
  const row: Row = {
    _cite: mintHandle("stats", `${congress}:${f.chamber as string}`),
    congress,
    chamber: f.chamber,
    scope: `${String(f.chamber)} only — every figure on this row counts ${String(f.chamber)} measures and nothing else`,
    chamberMeasures: breakdown.total,
    partyCounts: breakdown.partyCounts,
    partyLawCounts: breakdown.partyLawCounts,
    ...freshness,
  };
  if (breakdown.stageCounts) {
    row.stageCounts = breakdown.stageCounts;
  } else {
    row.stageCounts_unavailable =
      "We hold no per-stage figures for this chamber. Do NOT use the whole-Congress stage " +
      "ladder to answer a chamber question — it counts both chambers. The only chamber-scoped " +
      "law count on this row is partyLawCounts, whose values sum to this chamber's laws.";
  }

  return {
    ok: true,
    rows: [row],
    report: completeReport({
      set: `precomputed ${String(f.chamber)}-only totals for the ${congress}th Congress`,
      total: 1,
      shown: 1,
      order: "arbitrary",
    }),
  };
}
