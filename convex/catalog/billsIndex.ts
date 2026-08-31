/**
 * Which index `fetchBills` reads, and what that index does NOT enforce.
 *
 * This was an if/else chain inside fetch.ts whose ORDER was its whole
 * correctness argument, defended only by comments. Wrong order is not a slow
 * query: every filter the chosen index does not enforce is applied in memory
 * over a capped 200-row window, and every row outside that window is invisible
 * to the answer. Two shipped falsehoods came out of this chain, so the decision
 * lives here where tests can assert it (see billsIndex.test.ts).
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

export type BillsBranch =
  | "billId"
  | "titleSearch"
  | "billNumber"
  | "policyAreaAndStage"
  | "policyArea"
  | "sponsorStateAndStage"
  | "sponsorState"
  | "sponsorNames"
  | "reachedStage"
  | "progressStage"
  | "billType"
  | "congress";

export interface BillsIndexPlan {
  branch: BillsBranch;
  /** Convex index name this branch reads, or "search_title". */
  indexName: string;
  /** Filter keys the chosen index enforces itself. Everything else is in memory. */
  indexed: string[];
}

/**
 * Filter keys that narrow ROWS. `limit`, sort options and anything the catalog
 * does not declare are not row filters and must not be counted as unenforced —
 * counting them would make a fully-indexed query look like a capped scan.
 */
const ROW_FILTER_KEYS = [
  "billId",
  "congress",
  "titleFilter",
  "policyArea",
  "progressStage",
  "sponsorState",
  "sponsorFilter",
  "chamber",
  "billType",
  "billNumber",
  "reachedStage",
] as const;

/** Mirrors fetch.ts, which branches on `typeof f.x === "string"`. */
function isString(value: unknown): value is string {
  return typeof value === "string";
}

/** Mirrors fetch.ts, which branches on `typeof f.progressStage === "number"`. */
function isNumber(value: unknown): value is number {
  return typeof value === "number";
}

/**
 * fetch.ts runs titleFilter through `sanitizeSearchQuery` and takes the search
 * branch only when the result is non-empty. A blank title must fall through to
 * the next index rather than search for nothing and return the whole Congress.
 */
function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

/** sponsorFilter is an array; an empty one selects nobody and must fall through. */
function hasNames(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

interface BranchRule {
  plan: BillsIndexPlan;
  when: (filters: Record<string, unknown>) => boolean;
}

/**
 * Ordered most selective first. Order IS the contract; every reordering here
 * changes which rows an answer can see.
 */
const RULES: BranchRule[] = [
  {
    // An exact id is the most selective filter there is. Every branch below
    // scans a capped window, so a request for one known bill would otherwise be
    // answered by looking through the newest 200 and reporting "not found" for
    // anything older. congress is deliberately NOT indexed here: this index is
    // not congress-scoped, so a {billId, congress} pair is reconciled in memory.
    plan: { branch: "billId", indexName: "by_billId", indexed: ["billId"] },
    when: (f) => isString(f.billId),
  },
  {
    // The search index carries congress/billType/progressStage/sponsorState as
    // filterFields (see the `search_title` definition in schema.ts), so those
    // four are enforced by Convex rather than after the fact.
    plan: {
      branch: "titleSearch",
      indexName: "search_title",
      indexed: ["titleFilter", "congress", "billType", "progressStage", "sponsorState"],
    },
    when: (f) => hasText(f.titleFilter),
  },
  {
    // MUST come before billType. `{billType:"hr", billNumber:"1"}` on the
    // billType index reads the 200 NEWEST H.R. bills and looks for "1" in
    // memory — finding nothing, because H.R. 1 is the oldest.
    plan: {
      branch: "billNumber",
      indexName: "by_congress_and_bill_number",
      indexed: ["congress", "billNumber"],
    },
    when: (f) => isString(f.billNumber),
  },
  {
    // MUST come before policyArea. The pair on the policyArea index read the
    // 200 newest bills in a topic — all still in committee — and reported that
    // no Armed Forces bill had become law. 20 did in the 119th alone.
    plan: {
      branch: "policyAreaAndStage",
      indexName: "by_congress_policy_area_and_stage",
      indexed: ["congress", "policyArea", "progressStage"],
    },
    when: (f) => isString(f.policyArea) && isNumber(f.progressStage),
  },
  {
    plan: {
      branch: "policyArea",
      indexName: "by_congress_and_policy_area",
      indexed: ["congress", "policyArea"],
    },
    when: (f) => isString(f.policyArea),
  },
  {
    // MUST come before sponsorState. This pair is why "have any Texas bills
    // become law?" answered "we don't have that data" when 11 had in the 119th.
    plan: {
      branch: "sponsorStateAndStage",
      indexName: "by_congress_state_and_stage",
      indexed: ["congress", "sponsorState", "progressStage"],
    },
    when: (f) => isString(f.sponsorState) && isNumber(f.progressStage),
  },
  {
    // sponsorFilter is deliberately absent from `indexed`: the index covers the
    // SURNAME only, and the full name is matched in memory. Reporting it as
    // enforced would hide the reason "Monica De La Cruz" — like every member
    // with a two-word surname — was answered with zero bills.
    plan: {
      branch: "sponsorNames",
      indexName: "by_congress_and_sponsor_last",
      indexed: ["congress"],
    },
    when: (f) => hasNames(f.sponsorFilter),
  },
  {
    // A MILESTONE read: "got at least this far" spans several terminal stages,
    // so this branch reads each stage bucket through
    // by_congress_and_progress_stage and unions them. It sits above the broader
    // branches because those buckets are tiny — 194 at stage 60, 104 laws, 2
    // vetoed — where the alternatives scan a whole chamber (6,467 Senate
    // measures) and come back incomplete. "How many bills has the Senate
    // passed" is only answerable exactly because of this branch.
    plan: {
      branch: "reachedStage",
      indexName: "by_congress_and_progress_stage",
      indexed: ["congress", "reachedStage"],
    },
    when: (f) => isNumber(f.reachedStage),
  },
  {
    plan: {
      branch: "sponsorState",
      indexName: "by_congress_and_sponsor_state",
      indexed: ["congress", "sponsorState"],
    },
    when: (f) => isString(f.sponsorState),
  },
  {
    plan: {
      branch: "progressStage",
      indexName: "by_congress_and_progress_stage",
      indexed: ["congress", "progressStage"],
    },
    when: (f) => isNumber(f.progressStage),
  },
  {
    plan: {
      branch: "billType",
      indexName: "by_congress_and_type",
      indexed: ["congress", "billType"],
    },
    when: (f) => isString(f.billType),
  },
];

/** Every branch is congress-scoped, so the bare congress index is the floor. */
const CONGRESS_ONLY: BillsIndexPlan = {
  branch: "congress",
  indexName: "by_congress",
  indexed: ["congress"],
};

export function chooseBillsIndex(filters: Record<string, unknown>): BillsIndexPlan {
  for (const rule of RULES) {
    // Copied, not shared: a caller mutating `indexed` on a returned plan would
    // silently rewrite the rule table for every later call in the process.
    if (rule.when(filters)) return { ...rule.plan, indexed: [...rule.plan.indexed] };
  }
  return { ...CONGRESS_ONLY, indexed: [...CONGRESS_ONLY.indexed] };
}

/** How many of the caller's row filters the chosen index could NOT enforce. */
export function countInMemoryFilters(
  filters: Record<string, unknown>,
  plan: BillsIndexPlan,
): number {
  const enforced = new Set(plan.indexed);
  return ROW_FILTER_KEYS.filter(
    // undefined/null are absent, not filters: validateFilters drops them before
    // fetch.ts ever sees them, and counting them would overstate the risk.
    (key) => filters[key] !== undefined && filters[key] !== null && !enforced.has(key),
  ).length;
}
