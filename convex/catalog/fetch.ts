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
import type { Doc } from "../_generated/dataModel";
import { isDatasetName } from "./datasets";
import { validateFilters } from "./filters";
import { mintHandle } from "./cite";
import { SEARCH_LIMIT, sanitizeSearchQuery } from "../searchQuery";
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
import { candidateSurnames, matchesFullName } from "./sponsorName";

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

/** The bucket a row falls into for a grouped count. */
function groupValue(b: Doc<"bills">, field: string): string {
  switch (field) {
    case "policyArea":
      // Never silently drop the unclassified: ~4% of measures carry no policy
      // area, and folding them away would make the groups sum to less than the
      // total the same result reports.
      return b.policyAreaName ?? "(no policy area assigned)";
    case "progressStage":
      return String(b.progressStage ?? 20);
    case "sponsorState":
      return b.sponsorState ?? "(no state recorded)";
    case "sponsorParty":
      return b.sponsorParty ?? "(no party recorded)";
    case "billType":
      return b.billType;
    case "chamber":
      return HOUSE_TYPES.includes(b.billType)
        ? "house"
        : SENATE_TYPES.includes(b.billType)
          ? "senate"
          : "(unknown chamber)";
    default:
      throw new Error(`Unhandled groupBy field: ${field}`);
  }
}

/** "119th", "101st", "122nd" — a hardcoded "th" printed "the 101th Congress". */
function congressOrdinal(n: number): string {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th";
  return `${n}${suffix}`;
}

/**
 * The index that can serve a requested sort, when one exists.
 *
 * Reading through an ordering index and THEN filtering in memory still yields the
 * true first rows of the filtered set: the window holds the globally first rows
 * in order, so any surviving row is ahead of every row outside it. The count is
 * unknown, the order is exact — which is precisely the distinction
 * `orderFromIndex` records.
 *
 * Only consulted for a ROW fetch. A count-only fetch wants a total, and the
 * selective filter index gives a better one.
 */
function chooseOrderingIndex(
  f: Row,
): { indexName: "by_congress_and_latest_action" | "by_congress_stage_and_action" | "by_congress_and_introduced"; direction: "asc" | "desc"; order: RowOrder } | null {
  const sort = typeof f.sort === "string" ? SORT_FIELD[f.sort] : undefined;
  if (!sort) return null;
  // An exact id needs no ordering, and its own branch is far more selective.
  if (typeof f.billId === "string") return null;
  // The search index cannot be combined with an ordering index.
  if (typeof f.titleFilter === "string" && f.titleFilter !== "") return null;
  // reachedStage spans several stage buckets, so no single ordered range covers it.
  if (typeof f.reachedStage === "number") return null;

  const byIntroduced = f.sort === "newest_introduced" || f.sort === "oldest_introduced";
  if (byIntroduced) {
    return { indexName: "by_congress_and_introduced", direction: sort.direction, order: sort.order };
  }
  if (typeof f.progressStage === "number") {
    return { indexName: "by_congress_stage_and_action", direction: sort.direction, order: sort.order };
  }
  return { indexName: "by_congress_and_latest_action", direction: sort.direction, order: sort.order };
}

/** Plain-English description of the set a bills fetch drew from. */
function describeBillSet(f: Row): string {
  const parts: string[] = [];
  if (typeof f.billId === "string") return `the single bill ${f.billId}`;
  if (typeof f.policyArea === "string") parts.push(`policy area '${f.policyArea}'`);
  if (typeof f.progressStage === "number") parts.push(`terminal stage ${f.progressStage}`);
  if (typeof f.reachedStage === "number") parts.push(`having reached stage ${f.reachedStage}`);
  if (typeof f.sponsorState === "string") parts.push(`sponsored from ${f.sponsorState}`);
  if (Array.isArray(f.sponsorFilter) && f.sponsorFilter.length > 0) {
    parts.push(`sponsored by ${(f.sponsorFilter as string[]).join(", ")}`);
  }
  if (typeof f.chamber === "string") parts.push(`originating in the ${f.chamber}`);
  if (typeof f.billType === "string") parts.push(`of type ${f.billType}`);
  if (typeof f.billNumber === "string") parts.push(`numbered ${f.billNumber}`);
  if (typeof f.titleFilter === "string") parts.push(`with '${f.titleFilter}' in the title`);
  if (typeof f.introducedAfter === "string") parts.push(`introduced on or after ${f.introducedAfter}`);
  if (typeof f.introducedBefore === "string") parts.push(`introduced on or before ${f.introducedBefore}`);
  if (typeof f.actionAfter === "string") parts.push(`last acted on or after ${f.actionAfter}`);
  if (typeof f.actionBefore === "string") parts.push(`last acted on or before ${f.actionBefore}`);
  const congress = (f.congress as number) ?? 119;
  const where = parts.length > 0 ? ` ${parts.join(", ")}` : "";
  return `every measure in the ${congressOrdinal(congress)} Congress${where}`;
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
  const groupBy = typeof f.groupBy === "string" ? f.groupBy : null;
  // A grouped fetch is inherently a count: it ships one row per group, not bills,
  // so it gets the deeper ceiling whatever `limit` says.
  let ceiling = countOnly || groupBy ? COUNT_SCAN_LIMIT : SCAN_LIMIT;

  // The index choice is a correctness argument, not an optimisation, and it lives
  // in a tested module precisely because two production incidents came from
  // getting the ordering of these branches wrong. See billsIndex.ts.
  const plan = chooseBillsIndex(f);
  // A sort question and a count question want different indexes. Serve the sort
  // from an ordering index when one exists: "what is the most recent bill?" over
  // a whole Congress was refused outright before, because the set is too big to
  // count and the sort was refused along with the total.
  const ordering = countOnly || groupBy ? null : chooseOrderingIndex(f);

  // Convex caps a full-text search at SEARCH_LIMIT results regardless of what we
  // ask for, so our own ceiling cannot detect the cut. With the count-only
  // ceiling of 5,000 the check `candidates.length >= ceiling` was structurally
  // unreachable, and `{titleFilter:"Act", limit:0}` — the exact call the prompt
  // tells the model to make for a count — reported an exact total of 1,024
  // against a truth of 14,685. Lower the ceiling to the real one so a filled
  // search window is visible. convex/bills.ts already does this; this branch did
  // not.
  if (plan.branch === "titleSearch") ceiling = Math.min(ceiling, SEARCH_LIMIT);

  let candidates;
  let windowFilled = false;
  let orderFromIndex = false;
  /**
   * Set by branches that read several index ranges and therefore compute their
   * own capping — the sponsor-surname branch and the milestone branch. Their
   * concatenated results can exceed the ceiling without any single read having
   * been capped, so the generic check below must not overwrite them.
   */
  let ownCapping = false;

  if (ordering) {
    candidates = await ctx.db
      .query("bills")
      .withIndex(ordering.indexName, (q) => {
        const scoped = q.eq("congress", congress);
        return ordering.indexName === "by_congress_stage_and_action"
          ? scoped.eq("progressStage", f.progressStage as number)
          : scoped;
      })
      .order(ordering.direction === "desc" ? "desc" : "asc")
      .take(ceiling);
    windowFilled = candidates.length >= ceiling;
    ownCapping = true;
    orderFromIndex = true;
  } else
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
      // Read every plausible spelling of the surname and union the results, then
      // let the in-memory full-name match decide. Two production-shaped failures
      // make this necessary, and BOTH previously returned "complete, total 0" —
      // an authoritative claim that a sitting member had sponsored nothing:
      //
      //   Multi-token GIVEN names. "Anna Paulina Luna" is stored as first="Anna
      //   Paulina", last="Luna". Deriving the surname as "everything after the
      //   first token" yields "Paulina Luna", which matches no row. She has 39.
      //
      //   Mixed-case surnames. The 118th stores Barbara Lee's surname as both
      //   "LEE" and "Lee"; an index eq is case-sensitive, so one casing was
      //   invisible. That answered 12 where the truth is 59, on 85 of the 118th's
      //   595 members.
      let docsRead = 0;
      let exhausted = false;
      /** Per requested name: did ANY spelling of it return a row? */
      const productive = new Map<string, boolean>();
      const collected: Doc<"bills">[] = [];

      for (const requested of sponsorNames ?? []) {
        if (!productive.has(requested)) productive.set(requested, false);
        for (const candidate of candidateSurnames(requested)) {
          for (const spelling of surnameSpellings(candidate)) {
            // One shared budget across every read, so a name with many candidate
            // spellings cannot multiply the cost of the request.
            if (docsRead >= ceiling) {
              exhausted = true;
              break;
            }
            const rows = await ctx.db
              .query("bills")
              .withIndex("by_congress_and_sponsor_last", (q) =>
                q.eq("congress", congress).eq("sponsorLastName", spelling),
              )
              .order("desc")
              .take(ceiling - docsRead);
            docsRead += rows.length;
            if (rows.length > 0) productive.set(requested, true);
            collected.push(...rows);
          }
          if (exhausted) break;
        }
        if (exhausted) break;
      }
      candidates = collected;
      ownCapping = true;
      // Incomplete if we ran out of budget, or if ANY requested name produced no
      // row at all. A name we could not place must not be silently counted as
      // zero and folded into a total covering the names we could — that reports
      // a member as having sponsored nothing on the strength of a spelling.
      windowFilled =
        exhausted ||
        docsRead >= ceiling ||
        productive.size === 0 ||
        [...productive.values()].some((found) => !found);
      break;
    }
    case "reachedStage": {
      // Union of the terminal stage buckets that satisfy the milestone. Read
      // per-bucket rather than scanning a whole chamber: the buckets are small
      // and complete, where a chamber scan comes back capped and therefore
      // unanswerable. Each bucket gets the FULL ceiling, so one large bucket
      // cannot silently starve the others.
      // Sequential, not parallel, because the buckets share ONE read budget.
      // Reading `ceiling` from each of eight buckets meant a single count-only
      // call could read 5,779 documents and 4.15 MB — and discard all of it,
      // because a filled window returns no rows and no total.
      const stages = milestoneStages(f.reachedStage as number);
      const collectedStages: Doc<"bills">[] = [];
      let stageDocs = 0;
      for (const stage of stages) {
        if (stageDocs >= ceiling) break;
        const rows = await ctx.db
          .query("bills")
          .withIndex("by_congress_and_progress_stage", (q) =>
            q.eq("congress", congress).eq("progressStage", stage),
          )
          .order("desc")
          .take(ceiling - stageDocs);
        stageDocs += rows.length;
        collectedStages.push(...rows);
      }
      candidates = collectedStages;
      ownCapping = true;
      windowFilled = stageDocs >= ceiling;
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

  const requestedSort = typeof f.sort === "string" ? SORT_FIELD[f.sort] : undefined;
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
    // A missing date satisfies NO bound. Comparing `?? ""` let undated rows slip
    // under every `before` filter — "bills last acted on before 2020" returned 11
    // measures whose real answer is none — and sort them to the top of an
    // oldest-first list. An unknown date is unknown in both directions.
    if (typeof f.introducedAfter === "string") {
      if (!b.introducedDate || b.introducedDate < f.introducedAfter) return false;
    }
    if (typeof f.introducedBefore === "string") {
      if (!b.introducedDate || b.introducedDate > f.introducedBefore) return false;
    }
    if (typeof f.actionAfter === "string") {
      if (!b.latestActionDate || b.latestActionDate < f.actionAfter) return false;
    }
    if (typeof f.actionBefore === "string") {
      if (!b.latestActionDate || b.latestActionDate > f.actionBefore) return false;
    }
    // You cannot order by a value a row does not have. Convex sorts `undefined`
    // before every string, so an ascending read put the eleven undated measures
    // of the 119th at the very front and the contract then told the model "row 1
    // is genuinely the oldest" — of a bill with no known date at all.
    if (requestedSort && !requestedSort.key(b as BillSortRow)) return false;
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
  let order: RowOrder = "arbitrary";
  let ordered = matched;
  if (ordering) {
    // The database already returned these in order, and an in-memory filter
    // preserves it. Real even when the window filled — that is the whole point.
    order = ordering.order;
  } else if (requestedSort && !windowFilled) {
    ordered = [...matched].sort((a, b) => {
      const av = requestedSort.key(a);
      const bv = requestedSort.key(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return requestedSort.direction === "asc" ? cmp : -cmp;
    });
    order = requestedSort.order;
  }

  if (groupBy) {
    const buckets = new Map<string, number>();
    for (const b of matched) {
      buckets.set(groupValue(b, groupBy), (buckets.get(groupValue(b, groupBy)) ?? 0) + 1);
    }
    const groupRows = [...buckets.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([group, count]) => ({
        // A policy-area group IS a topic, and `topics:<congress>:<name>` already
        // renders as a link to that topic. The other group fields have no page to
        // point at, so they carry no handle rather than a broken one.
        ...(groupBy === "policyArea" ? { _cite: mintHandle("topics", `${congress}:${group}`) } : {}),
        group,
        count,
      }));
    return {
      ok: true,
      rows: groupRows,
      report: reportFor({
        set: `${describeBillSet(f)}, counted per ${groupBy}`,
        windowFilled,
        filteredInMemory: countInMemoryFilters(f, plan) > 0,
        matchedCount: matched.length,
        shown: groupRows.length,
        order: "largest_first",
        // `total` counts MEASURES and `shown` counts GROUPS — different units.
        // Saying so is what stops the generic sample warning from firing and
        // telling the model its complete breakdown is a page of itself.
        rowsAreGroups: true,
      }),
    };
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

  // A Congress we hold nothing for must not answer "0, and that is the complete
  // count". `{congress:116}` did, which states as fact that no measure from that
  // Congress ever became law — when the truth is we have not loaded it. One
  // indexed probe, and only when the answer would otherwise be an empty complete.
  if (matched.length === 0 && !windowFilled) {
    // A policy area we do not hold under that exact spelling is a failed lookup,
    // not an empty topic. `policyArea:"health"` matched nothing and reported a
    // complete zero — "no health bills became law" — over a capital letter.
    if (typeof f.policyArea === "string") {
      // Ask the BILLS table whether this spelling exists, not the precomputed
      // topic list. That list is truncated to the top 50 areas per Congress by an
      // unrelated job, so trusting it would make a real but low-frequency topic
      // get refused as an unknown spelling — trading a wrong count for a wrong
      // refusal, which is the same defect wearing a different coat. One indexed
      // read against the thing we are actually querying.
      const spelled = await ctx.db
        .query("bills")
        .withIndex("by_congress_and_policy_area", (q) =>
          q.eq("congress", congress).eq("policyAreaName", f.policyArea as string),
        )
        .take(1);
      const known = await ctx.db
        .query("congressPolicyAreas")
        .withIndex("by_congress", (q) => q.eq("congress", congress))
        .collect();
      const wanted = f.policyArea.trim().toLowerCase();
      const match = known.find((t) => t.policyAreaName.trim().toLowerCase() === wanted);
      // A spelling the bills table recognises is real, whatever the topic list
      // says: fall through and report the honest zero.
      if (spelled.length === 0 && !match) {
        return {
          ok: false,
          error:
            `We hold no policy area spelled '${String(f.policyArea)}' in the ` +
            `${congressOrdinal(congress)} Congress, so this is not a count of zero — it is a name ` +
            `we do not recognise. Fetch the 'topics' dataset to get the exact spellings, then ` +
            `retry. Do not tell the reader we have nothing on the subject.`,
        };
      }
      if (spelled.length === 0 && match && match.policyAreaName !== f.policyArea) {
        return {
          ok: false,
          error:
            `We spell that policy area '${match.policyAreaName}', not ` +
            `'${String(f.policyArea)}'. Retry with the exact spelling — the filter is an exact ` +
            `match, and a near miss returns nothing while looking like an empty topic.`,
        };
      }
    }
    const anyForCongress = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) => q.eq("congress", congress))
      .take(1);
    if (anyForCongress.length === 0) {
      return {
        ok: false,
        error:
          `We hold no measures at all for the ${congressOrdinal(congress)} Congress, so this is ` +
          `not a count of zero — it is a Congress we have not loaded. Say we do not hold it. ` +
          `Do not report any figure for it, and do not describe it as empty.`,
      };
    }
  }

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
      // Only meaningful if something survived the in-memory filter: an empty page
      // from an ordered window tells you nothing about what lies beyond it.
      orderFromIndex: orderFromIndex && rows.length > 0,
    }),
  };
}

/**
 * Spellings of a surname to try against the case-sensitive index.
 *
 * The stored data is not consistent: the 118th holds both "LEE" and "Lee", and
 * both "Smith" and "SMITH". Trying only the spelling we were handed made 85 of
 * that Congress's 595 members return a wrong total that was flagged complete.
 */
function surnameSpellings(surname: string): string[] {
  const trimmed = surname.trim();
  if (trimmed === "") return [];
  const title = trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  return [...new Set([trimmed, title, trimmed.toUpperCase()])];
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

  // One row per PERSON, not per spelling. The 118th stores Barbara Lee twice —
  // "Barbara Lee" with 12 and "BARBARA LEE" with 47 — so California came back
  // with 67 "members" against 54 seats, and the split fragments corrupted the
  // ranking: Anna Eshoo appeared with 4 bills when her real total is 30. Summing
  // is the correct merge; 12 + 47 = 59 is exactly her count in the bills table.
  const byPerson = new Map<string, { sponsorName: string; billCount: number; sponsorParty?: string; sponsorState?: string }>();
  for (const row of all) {
    const key = row.sponsorName.trim().toLowerCase().replace(/\s+/g, " ");
    const held = byPerson.get(key);
    if (!held) {
      byPerson.set(key, {
        sponsorName: row.sponsorName,
        billCount: row.billCount,
        sponsorParty: row.sponsorParty,
        sponsorState: row.sponsorState,
      });
      continue;
    }
    held.billCount += row.billCount;
    // Prefer a mixed-case spelling for display: SHOUTING a member's name at the
    // reader is a tell that we are showing them a raw row. Never invent a casing
    // — title-casing a surname would misspell McCarthy, and a wrong name is worse
    // than a loud one — so this only ever picks between spellings we hold.
    const uniform = (n: string) => n === n.toUpperCase() || n === n.toLowerCase();
    if (uniform(held.sponsorName) && !uniform(row.sponsorName)) {
      held.sponsorName = row.sponsorName;
    }
    held.sponsorParty = held.sponsorParty ?? row.sponsorParty;
    held.sponsorState = held.sponsorState ?? row.sponsorState;
  }
  const merged = [...byPerson.values()];
  // `fewest_bills` is not a convenience. Without it "who introduced the fewest
  // bills in California" could not be answered at all: the read is complete and
  // the total exact, but the page is 50 of 54 ordered most-first, so the true
  // minimum was never on it and the model read the last visible row instead.
  const ascending = f.sort === "fewest_bills";
  const sorted = merged.sort((a, b) =>
    ascending ? a.billCount - b.billCount : b.billCount - a.billCount,
  );
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
      order: windowFilled ? "arbitrary" : ascending ? "fewest_bills_first" : "most_bills_first",
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

/**
 * The bills-versus-resolutions split, spelled out so the model does not have to
 * know which of eight type slugs is a bill.
 *
 * "How many bills have been introduced" was unanswerable: 18,476 measures is far
 * past any scan ceiling, so counting hr and s directly came back incomplete, and
 * the one number on hand counted resolutions as bills.
 */
function typeBreakdown(
  typeCounts: Array<{ billType: string; count: number }> | undefined,
): Record<string, unknown> {
  if (!typeCounts || typeCounts.length === 0) {
    return {
      billsVersusResolutions_unavailable:
        "We hold no per-type breakdown for this Congress, so totalMeasures cannot be split into " +
        "bills and resolutions. Do not present it as a count of bills.",
    };
  }
  const counts = Object.fromEntries(typeCounts.map((t) => [t.billType, t.count]));
  const sum = (types: string[]) => types.reduce((a, t) => a + (counts[t] ?? 0), 0);
  return {
    measuresByType: counts,
    billsOnly: sum(["hr", "s"]),
    jointResolutions: sum(["hjres", "sjres"]),
    otherResolutions: sum(["hconres", "sconres", "hres", "sres"]),
    billsVersusResolutions:
      "billsOnly is what an ordinary reader means by 'bills' (H.R. and S.). The other two are " +
      "resolutions: joint resolutions can become law, concurrent and simple ones never can. " +
      "totalMeasures is all of them added together — never call it a count of bills.",
  };
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
          ...typeBreakdown(stats.typeCounts),
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
