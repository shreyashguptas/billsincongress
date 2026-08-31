/**
 * The Phase 1 acceptance gate (spec §12), runnable WITHOUT a Convex deploy.
 *
 * It drives the real system prompt, the real tool schemas, the real filter
 * validator, the real completeness contract and the real citation resolver
 * against the live model, but serves fetch_dataset from fixtures instead of the
 * database. That is enough to test what the gate is actually about — whether the
 * model stays inside our data, admits what we do not hold, and refuses to make a
 * set-level claim from a page — because those properties come from the catalog's
 * prose, the contract in completeness.ts and the resolver, not from the rows.
 *
 * The fixtures are FILTER-AWARE and built from real production numbers, because
 * the thing under test is the model's reaction to a completeness STATE. A fixture
 * that always came back complete would test nothing that shipped wrong: every
 * defect in the 2026-08-30 audit was a set-level claim made over an incomplete
 * read. Each rule below names the production situation it reproduces.
 *
 * What it does NOT cover: the real fetch handlers and their indexes (those are
 * exercised against a local copy of production in scripts/truth/handlers.test.ts)
 * and the answer sanitiser. The vocabulary check here is deliberately run on the
 * model's RAW prose, upstream of convex/catalog/answerSanitize.ts: the sanitiser
 * removes a leak by deleting the whole paragraph that carries it, so a leak the
 * reader never sees still costs them a paragraph of their answer.
 *
 * Run: OPENROUTER_API_KEY=sk-or-... ./node_modules/.bin/tsx scripts/check-grounding.ts
 */
import { ANSWER_TOOLS, buildSystemPrompt, MAX_TOOL_ROUNDS } from "../convex/catalog/tools";
import { describeDataset, isDatasetName } from "../convex/catalog/datasets";
import { mintHandle, resolveAnswer } from "../convex/catalog/cite";
import { validateFilters } from "../convex/catalog/filters";
import {
  completeReport,
  payloadFor,
  reportFor,
  workLogLabel,
  type CompletenessReport,
} from "../convex/catalog/completeness";
import type { DatasetName } from "../convex/catalog/types";

const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731";
const PROVIDERS = (process.env.OPENROUTER_PROVIDERS || "deepinfra")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Copied from convex/answer.ts, which cannot be imported here — it pulls in the
 * Convex server runtime. Keep the two in step: the point of this harness is that
 * the model sees the same last round it sees in production.
 */
const FINAL_ROUND_INSTRUCTION =
  "You have no lookups left. Answer now from what you already retrieved. If that covers only " +
  "part of what was asked, give that part and say plainly, in the same sentence, which part you " +
  "could not get. Do not ask the reader to rephrase.";

/** Mirrors convex/answer.ts, which dates "recent" and "this week" from today. */
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Mirrors the ceilings in convex/catalog/fetch.ts. They decide completeness, so
 * a copy that has drifted makes this harness rehearse a system we do not run:
 * this file said 8,000 while fetch.ts says 5,000, which would have reported any
 * set between the two as complete-with-a-total when production returns no total
 * at all. Both numbers are load-bearing there — 1,000 matches the site's own
 * list scan, and 5,000 is sized to stay inside Convex's 8 MiB read limit — so
 * neither may be rounded up here for convenience.
 */
const SCAN_LIMIT = 1000;
const COUNT_SCAN_LIMIT = 5000;

type Row = Record<string, unknown>;
type Filters = Record<string, unknown>;

interface Served {
  rows: Row[];
  report: CompletenessReport;
}

// ---------------------------------------------------------------------------
// REAL DATA. Every number and name below is read from the production copy in
// .truth-cache, so a failing check can be argued about in terms of the actual
// corpus rather than invented bills.
// ---------------------------------------------------------------------------

interface BillFixture {
  billId: string;
  label: string;
  title: string;
  congress: number;
  introducedDate: string;
  sponsor: string;
  sponsorParty: string;
  sponsorState: string;
  progressStage: number;
  policyArea: string;
  latestActionDate: string;
}

function billRow(b: BillFixture): Row {
  return { _cite: mintHandle("bills", b.billId), ...b };
}

const HR1: BillFixture = {
  billId: "1hr119",
  label: "H.R. 1",
  title: "An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.",
  congress: 119,
  introducedDate: "2025-05-20",
  sponsor: "Jodey Arrington",
  sponsorParty: "R",
  sponsorState: "TX",
  progressStage: 100,
  policyArea: "Economics and Public Finance",
  latestActionDate: "2025-07-04",
};

/** The only Health measure in the 119th that became law. */
const HEALTH_LAW: BillFixture = {
  billId: "2483hr119",
  label: "H.R. 2483",
  title: "SUPPORT for Patients and Communities Reauthorization Act of 2025",
  congress: 119,
  introducedDate: "2025-03-31",
  sponsor: "Brett Guthrie",
  sponsorParty: "R",
  sponsorState: "KY",
  progressStage: 100,
  policyArea: "Health",
  latestActionDate: "2025-12-01",
};

/**
 * A page of five real 119th-Congress measures in DATABASE order, which is what
 * `order: "arbitrary"` means. Deliberately arranged the way the audit found the
 * rows: the first row is not the newest, and the newest (H.R. 10152, acted on
 * 2026-08-27) sits in the middle, where the model once read a "most recent" off
 * the top of the page while a later row carried a later date.
 */
const ARBITRARY_PAGE: BillFixture[] = [
  {
    billId: "9710hr119",
    label: "H.R. 9710",
    title: "Third World Immigration Moratorium Act",
    congress: 119,
    introducedDate: "2026-07-15",
    sponsor: "Nancy Mace",
    sponsorParty: "R",
    sponsorState: "SC",
    progressStage: 40,
    policyArea: "Immigration",
    latestActionDate: "2026-07-15",
  },
  {
    billId: "4729s119",
    label: "S. 4729",
    title: "Biosecurity Smuggling Deterrence Act of 2026",
    congress: 119,
    introducedDate: "2026-06-10",
    sponsor: "Tom Cotton",
    sponsorParty: "R",
    sponsorState: "AR",
    progressStage: 40,
    policyArea: "Crime and Law Enforcement",
    latestActionDate: "2026-06-10",
  },
  {
    billId: "10152hr119",
    label: "H.R. 10152",
    title: "Open-Source AI Leadership Act",
    congress: 119,
    introducedDate: "2026-08-27",
    sponsor: "Gabe Evans",
    sponsorParty: "R",
    sponsorState: "CO",
    progressStage: 40,
    policyArea: "",
    latestActionDate: "2026-08-27",
  },
  {
    billId: "143hjres119",
    label: "H.J.Res. 143",
    title: "Resolution Act.",
    congress: 119,
    introducedDate: "2026-01-22",
    sponsor: "James McGovern",
    sponsorParty: "D",
    sponsorState: "MA",
    progressStage: 40,
    policyArea: "Congress",
    latestActionDate: "2026-05-20",
  },
  {
    billId: "10149hr119",
    label: "H.R. 10149",
    title: "For the relief of Maria Cordova.",
    congress: 119,
    introducedDate: "2026-08-24",
    sponsor: "Juan Vargas",
    sponsorParty: "D",
    sponsorState: "CA",
    progressStage: 40,
    policyArea: "",
    latestActionDate: "2026-08-24",
  },
];

const KNOWN_BILLS: BillFixture[] = [HR1, HEALTH_LAW, ...ARBITRARY_PAGE];

/** Exact measure counts per policy area, 119th Congress. */
const TOPIC_COUNTS: Array<[string, number]> = [
  ["Health", 2121],
  ["Armed Forces and National Security", 1468],
  ["Government Operations and Politics", 1369],
  ["International Affairs", 1289],
  ["Taxation", 1250],
  ["Crime and Law Enforcement", 1110],
  ["Agriculture and Food", 752],
  ["Transportation and Public Works", 741],
  ["Finance and Financial Sector", 737],
  ["Immigration", 688],
  ["Education", 678],
  ["Public Lands and Natural Resources", 671],
];

/** The number this gate expects to see stated when a result comes back complete. */
export const HEALTH_TOTAL = 2121;

/**
 * Exact totals for policy area + terminal stage, the pair that has its own index.
 * Only combinations we have actually counted appear here; anything else comes
 * back incomplete, because a fixture may not invent a total either.
 */
const POLICY_AREA_STAGE_TOTALS: Record<string, number> = { "Health:100": 1 };

/** Measures per sponsoring state in the 119th. Only what the fixtures need. */
const STATE_MEASURES: Record<string, number> = { TX: 1231 };

const STATS_ROWS: Array<{
  congress: number;
  totalMeasures: number;
  houseMeasures: number;
  senateMeasures: number;
  stageCounts: Array<{ stage: number; description: string; count: number }>;
}> = [
  {
    congress: 119,
    totalMeasures: 18476,
    houseMeasures: 12009,
    senateMeasures: 6467,
    stageCounts: [
      { stage: 20, description: "Introduced", count: 479 },
      { stage: 40, description: "In Committee", count: 17697 },
      { stage: 60, description: "Passed One Chamber", count: 194 },
      { stage: 85, description: "Vetoed", count: 2 },
      { stage: 100, description: "Became Law", count: 104 },
    ],
  },
  {
    congress: 118,
    totalMeasures: 19315,
    houseMeasures: 12556,
    senateMeasures: 6759,
    stageCounts: [
      { stage: 20, description: "Introduced", count: 575 },
      { stage: 40, description: "In Committee", count: 18229 },
      { stage: 60, description: "Passed One Chamber", count: 224 },
      { stage: 85, description: "Vetoed", count: 13 },
      { stage: 100, description: "Became Law", count: 274 },
    ],
  },
  {
    congress: 117,
    totalMeasures: 17828,
    houseMeasures: 11472,
    senateMeasures: 6356,
    stageCounts: [
      { stage: 20, description: "Introduced", count: 564 },
      { stage: 40, description: "In Committee", count: 16721 },
      { stage: 60, description: "Passed One Chamber", count: 176 },
      { stage: 80, description: "Passed Both Chambers", count: 2 },
      { stage: 100, description: "Became Law", count: 365 },
    ],
  },
];

/**
 * The per-chamber rows, exactly as congressChamberBreakdowns holds them for the
 * 119th. No stage ladder: the table has none, which is why fetch.ts sends the
 * `stageCounts_unavailable` warning instead. partyLawCounts sums to 64 for the
 * House — the number the audit found published as 104, because the whole-
 * Congress ladder had been read under a chamber-shaped question.
 */
const CHAMBER_BREAKDOWNS: Record<
  string,
  { total: number; partyCounts: Record<string, number>; partyLawCounts: Record<string, number> }
> = {
  "119:house": {
    total: 12009,
    partyCounts: { D: 5734, I: 3, R: 6272, U: 0 },
    partyLawCounts: { D: 8, I: 0, R: 56, U: 0 },
  },
  "119:senate": {
    total: 6467,
    partyCounts: { D: 3102, I: 87, R: 3278, U: 0 },
    partyLawCounts: { D: 4, I: 0, R: 36, U: 0 },
  },
};

/** The eight most prolific sponsors of the 119th, with their exact bill counts. */
const SPONSOR_ROWS: Array<{
  sponsorName: string;
  billCount: number;
  sponsorParty: string;
  sponsorState: string;
}> = [
  { sponsorName: "Rick Scott", billCount: 182, sponsorParty: "R", sponsorState: "FL" },
  { sponsorName: "Edward Markey", billCount: 156, sponsorParty: "D", sponsorState: "MA" },
  { sponsorName: "Marsha Blackburn", billCount: 140, sponsorParty: "R", sponsorState: "TN" },
  { sponsorName: "Mike Lee", billCount: 136, sponsorParty: "R", sponsorState: "UT" },
  { sponsorName: "John Cornyn", billCount: 136, sponsorParty: "R", sponsorState: "TX" },
  { sponsorName: "Richard Durbin", billCount: 134, sponsorParty: "D", sponsorState: "IL" },
  { sponsorName: "Ted Cruz", billCount: 131, sponsorParty: "R", sponsorState: "TX" },
  { sponsorName: "Richard Blumenthal", billCount: 124, sponsorParty: "D", sponsorState: "CT" },
];

/** The three oldest of H.R. 1's 59 recorded actions, as fetchActions pages them. */
const HR1_ACTIONS: Array<{ date: string; text: string; type: string }> = [
  {
    date: "2025-05-20",
    text: "The House Committee on the Budget reported an original measure, H. Rept. 119-106, by Mr. Arrington.",
    type: "Committee",
  },
  { date: "2025-05-20", text: "Placed on the Union Calendar, Calendar No. 78.", type: "Calendars" },
  { date: "2025-05-22", text: "Considered under the provisions of rule H. Res. 436.", type: "Floor" },
];
const HR1_ACTION_TOTAL = 59;

// ---------------------------------------------------------------------------
// THE FIXTURE FETCH LAYER
// ---------------------------------------------------------------------------

/** Mirrors describeBillSet in fetch.ts: prose the model reasons about. */
function describeBillSet(f: Filters): string {
  if (typeof f.billId === "string") return `the single bill ${f.billId}`;
  const parts: string[] = [];
  if (typeof f.policyArea === "string") parts.push(`policy area '${f.policyArea}'`);
  if (typeof f.progressStage === "number") parts.push(`terminal stage ${f.progressStage}`);
  if (typeof f.reachedStage === "number") parts.push(`having reached stage ${f.reachedStage}`);
  if (typeof f.sponsorState === "string") parts.push(`sponsored from ${f.sponsorState}`);
  if (typeof f.chamber === "string") parts.push(`originating in the ${f.chamber}`);
  if (typeof f.billType === "string") parts.push(`of type ${f.billType}`);
  if (typeof f.billNumber === "string") parts.push(`numbered ${f.billNumber}`);
  if (typeof f.titleFilter === "string") parts.push(`with '${f.titleFilter}' in the title`);
  if (typeof f.introducedAfter === "string") parts.push(`introduced on or after ${f.introducedAfter}`);
  if (typeof f.introducedBefore === "string") parts.push(`introduced on or before ${f.introducedBefore}`);
  if (typeof f.actionAfter === "string") parts.push(`last acted on or after ${f.actionAfter}`);
  if (typeof f.actionBefore === "string") parts.push(`last acted on or before ${f.actionBefore}`);
  const congress = typeof f.congress === "number" ? f.congress : 119;
  return `every measure in the ${congress}th Congress${parts.length > 0 ? ` ${parts.join(", ")}` : ""}`;
}

/** `1hr119` → `1`; `143hjres119` → `143`. The id is `number + type + congress`. */
function numberOf(b: BillFixture): string {
  return b.billId.match(/^\d+/)?.[0] ?? "";
}

/** `1hr119` → `hr`; `143hjres119` → `hjres`. */
function typeOf(b: BillFixture): string {
  return b.billId.replace(/^\d+/, "").replace(/\d+$/, "");
}

const DATE_FILTERS = ["introducedAfter", "introducedBefore", "actionAfter", "actionBefore"];

function hasDateFilter(f: Filters): boolean {
  return DATE_FILTERS.some((k) => typeof f[k] === "string");
}

/** The whole set was read: an exact total, and the rows are a page of it. */
function complete(set: string, total: number, rows: Row[], order: CompletenessReport["order"]): Served {
  return { rows, report: completeReport({ set, total, shown: rows.length, order }) };
}

/** The window filled: no total, no ranking, and an empty result is not "none". */
function partial(set: string, rows: Row[], filteredInMemory: boolean): Served {
  return {
    rows,
    report: reportFor({
      set,
      windowFilled: true,
      filteredInMemory,
      matchedCount: rows.length,
      shown: rows.length,
      order: "arbitrary",
    }),
  };
}

/**
 * The sorts `bills` accepts (VALID_SORTS in filters.ts) and the order each one
 * licenses. Mirrors SORT_FIELD in fetch.ts.
 */
const SORT_FIELD: Record<
  string,
  { key: (b: BillFixture) => string; direction: "asc" | "desc"; order: CompletenessReport["order"] }
> = {
  newest_action: { key: (b) => b.latestActionDate, direction: "desc", order: "newest_action_first" },
  oldest_action: { key: (b) => b.latestActionDate, direction: "asc", order: "oldest_action_first" },
  newest_introduced: {
    key: (b) => b.introducedDate,
    direction: "desc",
    order: "newest_introduced_first",
  },
  oldest_introduced: {
    key: (b) => b.introducedDate,
    direction: "asc",
    order: "oldest_introduced_first",
  },
};

/**
 * A COMPLETE bills read, with the requested sort applied where this fixture can
 * honestly apply it.
 *
 * `sort` is not decoration: the catalog calls it REQUIRED for any "most recent"
 * question, so the model asks for it constantly, and fetch.ts honours it exactly
 * when the window did not fill — sorting a sample and labelling it "newest
 * first" is how the third-most-recent law was once named the most recent. A
 * fixture that dropped the argument on the floor would put the model in a state
 * production cannot produce: `complete: true` with `order: "arbitrary"` after a
 * sort was asked for.
 *
 * The condition is stricter here than in fetch.ts, and deliberately: production
 * sorts every matching row and then pages, so its first row really is the
 * newest of the total it reports. This fixture holds seven bills against totals
 * in the thousands, so it may only claim an order for a set it holds ENTIRELY —
 * claiming "newest first" over two of 104 laws would be the fixture inventing a
 * maximum, the same sin as inventing a total. Sets it holds a page of stay
 * `arbitrary`, which is the safe direction: it withholds a guarantee production
 * would give, and never offers one production would not.
 */
function completeBills(
  f: Filters,
  set: string,
  total: number,
  bills: BillFixture[],
  page: (rows: Row[]) => Row[],
): Served {
  const sort = typeof f.sort === "string" ? SORT_FIELD[f.sort] : undefined;
  const holdsWholeSet = bills.length === total;
  if (!sort || !holdsWholeSet) return complete(set, total, page(bills.map(billRow)), "arbitrary");
  // Sorted BEFORE paging, as fetch.ts sorts `matched` and then slices; paging
  // first would sort the wrong rows and hand back a different page.
  const ordered = [...bills].sort((a, b) => {
    const av = sort.key(a);
    const bv = sort.key(b);
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return sort.direction === "asc" ? cmp : -cmp;
  });
  return complete(set, total, page(ordered.map(billRow)), sort.order);
}

/**
 * `bills`, filter-aware. The rules are ordered the way chooseBillsIndex orders
 * its branches, and each reproduces a state the real handler reaches.
 */
function serveBills(f: Filters, limit: number): Served {
  const countOnly = limit === 0;
  const ceiling = countOnly ? COUNT_SCAN_LIMIT : SCAN_LIMIT;
  const page = (rows: Row[]) => (countOnly ? [] : rows.slice(0, Math.min(limit || 20, 50)));
  const set = describeBillSet(f);

  // One exact id, or one number within a type: by_billId / by_congress_and_bill_number.
  // Both read a handful of rows, so both come back complete.
  const byId =
    typeof f.billId === "string"
      ? KNOWN_BILLS.filter((b) => b.billId === f.billId)
      : typeof f.billNumber === "string"
        ? KNOWN_BILLS.filter(
            (b) =>
              numberOf(b) === f.billNumber &&
              (typeof f.billType !== "string" || typeOf(b) === f.billType),
          )
        : null;
  // An empty result here would be a COMPLETE zero, i.e. "no such bill exists".
  // Only bills this fixture holds may be answered that confidently; anything else
  // is reported as unread rather than as absent.
  if (byId) {
    return byId.length > 0
      ? completeBills(f, set, byId.length, byId, page)
      : partial(set, [], true);
  }

  // No bills index enforces a DATE — every index is keyed on congress plus a
  // categorical — so a dated read filters an insertion-ordered window in memory,
  // and the window is not ordered by date. This is the shape that answered "no
  // Texas bills became law" when eleven had: an empty INCOMPLETE result.
  if (hasDateFilter(f)) return partial(set, [], true);

  // A filter combination whose size this fixture does not know. It reports
  // INCOMPLETE rather than reusing the nearest total it does know: emitting a
  // number that was never counted is the exact bug the contract exists to stop,
  // and a fixture that does it teaches the model the wrong thing. (It did: the
  // fixture answered {policyArea:"Health", billType:"hr"} with Health's whole
  // total, and the model published "the count is the same, because the Health
  // topic contains no resolutions".)
  const unmodelled =
    typeof f.billType === "string" ||
    typeof f.chamber === "string" ||
    typeof f.titleFilter === "string" ||
    typeof f.reachedStage === "number" ||
    Array.isArray(f.sponsorFilter);

  if (typeof f.policyArea === "string") {
    const topic = TOPIC_COUNTS.find(([name]) => name === f.policyArea);
    if (!topic || unmodelled || typeof f.sponsorState === "string") return partial(set, [], true);
    // policyArea + progressStage is its own index (by_congress_policy_area_and_stage),
    // so the pair is read completely — the whole reason that branch exists.
    if (typeof f.progressStage === "number") {
      const known = POLICY_AREA_STAGE_TOTALS[`${f.policyArea}:${f.progressStage}`];
      if (known === undefined) return partial(set, [], true);
      const rows = KNOWN_BILLS.filter(
        (b) => b.policyArea === f.policyArea && b.progressStage === f.progressStage,
      );
      return completeBills(f, set, known, rows, page);
    }
    const rows = KNOWN_BILLS.filter((b) => b.policyArea === f.policyArea);
    // 2,121 Health measures exceed the 1,000-row window but not the 5,000-row
    // count window: the same filters are incomplete for a listing and complete
    // for a count. That asymmetry is the whole argument for `limit: 0`.
    if (topic[1] >= ceiling) return partial(set, page(rows.map(billRow)), false);
    return completeBills(f, set, topic[1], rows, page);
  }

  if (typeof f.sponsorState === "string") {
    const size = STATE_MEASURES[f.sponsorState];
    if (size === undefined || unmodelled || typeof f.progressStage === "number") {
      return partial(set, [], true);
    }
    const rows = KNOWN_BILLS.filter((b) => b.sponsorState === f.sponsorState);
    if (size >= ceiling) return partial(set, page(rows.map(billRow)), false);
    return completeBills(f, set, size, rows, page);
  }

  // by_congress_and_progress_stage. The 104 measures that became law fit inside
  // both windows; the 17,697 sitting in committee fit inside neither.
  if (typeof f.progressStage === "number" && !unmodelled) {
    const stats = STATS_ROWS.find((s) => s.congress === (f.congress ?? 119));
    const bucket = stats?.stageCounts.find((s) => s.stage === f.progressStage);
    if (bucket === undefined) return partial(set, [], true);
    const rows = KNOWN_BILLS.filter((b) => b.progressStage === f.progressStage);
    if (bucket.count >= ceiling) return partial(set, page(rows.map(billRow)), false);
    return completeBills(f, set, bucket.count, rows, page);
  }

  // Congress-wide. 18,476 measures overflow both windows, so this read can never
  // come back complete and a requested sort is REFUSED rather than applied to a
  // sample — exactly as fetch.ts does when the window fills. That refusal is what
  // leaves `order: "arbitrary"` on a page whose first row is not the newest.
  return partial(set, page(ARBITRARY_PAGE.map(billRow)), false);
}

function serveTopics(f: Filters): Served {
  const congress = typeof f.congress === "number" ? f.congress : 119;
  if (congress !== 119) {
    // Only the 119th is loaded here. Reported as incomplete rather than as an
    // empty complete read, because an empty complete read means "there are none".
    return partial(`every policy area in the ${congress}th Congress`, [], true);
  }
  const rows = TOPIC_COUNTS.map(([policyAreaName, count]) => ({
    _cite: mintHandle("topics", `119:${policyAreaName}`),
    policyAreaName,
    count,
    congress,
  }));
  return complete(
    "the twelve largest policy areas in the 119th Congress, with their exact measure counts",
    rows.length,
    rows,
    "largest_first",
  );
}

function serveSponsors(f: Filters, limit: number): Served {
  const congress = typeof f.congress === "number" ? f.congress : 119;
  const state = typeof f.sponsorState === "string" ? f.sponsorState : null;
  const matched = state
    ? SPONSOR_ROWS.filter((s) => s.sponsorState === state)
    : SPONSOR_ROWS;
  const rows =
    limit === 0
      ? []
      : matched.slice(0, Math.min(limit || 20, 50)).map((s) => ({
          _cite: mintHandle("sponsors", `${congress}:${s.sponsorName}`),
          ...s,
          congress,
        }));
  return complete(
    state
      ? `the members from ${state} among the eight most prolific sponsors of the ${congress}th Congress`
      : `the eight most prolific sponsors of the ${congress}th Congress`,
    matched.length,
    rows,
    "most_bills_first",
  );
}

function serveStats(f: Filters): { ok: false; error: string } | Served {
  const congress = typeof f.congress === "number" ? f.congress : 119;
  if (f.chamber === "house" || f.chamber === "senate") {
    const breakdown = CHAMBER_BREAKDOWNS[`${congress}:${String(f.chamber)}`];
    // fetch.ts refuses ONLY when we hold no breakdown row. We do hold one for
    // the 119th, so refusing here unconditionally taught the model that a
    // chamber figure cannot be had — and put the audit's most-quoted defect,
    // "104 House bills became law" when the answer is 64, out of reach of this
    // gate entirely.
    if (!breakdown) {
      return {
        ok: false,
        error:
          `We hold no per-chamber breakdown for the ${congress}th Congress, so a ` +
          `${String(f.chamber)}-only figure cannot be given. Whole-Congress totals are ` +
          `available by omitting the chamber filter — but they cover BOTH chambers and must ` +
          `not be described as one chamber's.`,
      };
    }
    return complete(
      `precomputed ${String(f.chamber)}-only totals for the ${congress}th Congress`,
      1,
      [
        {
          _cite: mintHandle("stats", `${congress}:${String(f.chamber)}`),
          congress,
          chamber: f.chamber,
          scope: `${String(f.chamber)} only — every figure on this row counts ${String(f.chamber)} measures and nothing else`,
          chamberMeasures: breakdown.total,
          partyCounts: breakdown.partyCounts,
          partyLawCounts: breakdown.partyLawCounts,
          // Our chamber rows carry no stage ladder, so fetch.ts replaces it with
          // this warning rather than letting the whole-Congress ladder ride along
          // under a chamber label.
          stageCounts_unavailable:
            "We hold no per-stage figures for this chamber. Do NOT use the whole-Congress stage " +
            "ladder to answer a chamber question — it counts both chambers. The only chamber-scoped " +
            "law count on this row is partyLawCounts, whose values sum to this chamber's laws.",
          figuresLastRecomputed: `${TODAY}T06:06:02.628Z`,
          dataLastSynced: `${TODAY}T06:05:58.329Z`,
        },
      ],
      "arbitrary",
    );
  }
  const stats = STATS_ROWS.find((s) => s.congress === congress);
  if (!stats) return partial(`precomputed totals for the ${congress}th Congress`, [], false);
  return complete(
    `precomputed whole-Congress totals for the ${congress}th`,
    1,
    [
      {
        _cite: mintHandle("stats", String(congress)),
        congress,
        scope: "whole Congress, both chambers",
        totalMeasures: stats.totalMeasures,
        houseMeasures: stats.houseMeasures,
        senateMeasures: stats.senateMeasures,
        stageCounts: stats.stageCounts,
        figuresLastRecomputed: `${TODAY}T06:05:58.329Z`,
        dataLastSynced: `${TODAY}T06:05:58.329Z`,
      },
    ],
    "arbitrary",
  );
}

function serveActions(f: Filters, limit: number): Served {
  const billId = String(f.billId ?? "");
  if (billId !== HR1.billId) {
    // Not loaded here. Incomplete, so an empty result cannot be read as "this
    // bill has never had an action".
    return partial(`every recorded action on ${billId}`, [], true);
  }
  const rows = HR1_ACTIONS.slice(0, limit || 50).map((a, i) => ({
    _cite: mintHandle("bill_actions", `${billId}:${a.date}:${i}`),
    billId,
    date: a.date,
    text: a.text,
    type: a.type,
  }));
  return complete(`every recorded action on ${billId}`, HR1_ACTION_TOTAL, rows, "chronological");
}

function serveSummaries(f: Filters): Served {
  const billId = String(f.billId ?? "");
  return partial(`every distinct summary version of ${billId}`, [], true);
}

export function serveFetch(
  name: DatasetName,
  filters: Filters,
  limit: number,
): { ok: false; error: string } | Served {
  switch (name) {
    case "bills":
      return serveBills(filters, limit);
    case "topics":
      return serveTopics(filters);
    case "sponsors":
      return serveSponsors(filters, limit);
    case "stats":
      return serveStats(filters);
    case "bill_actions":
      return serveActions(filters, limit);
    case "bill_summaries":
      return serveSummaries(filters);
  }
}

// ---------------------------------------------------------------------------
// THE LOOP. Mirrors runLoop in convex/answer.ts.
// ---------------------------------------------------------------------------

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
};

async function callModel(messages: ChatMessage[], withTools: boolean) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      // Withheld entirely on the final round, as answer.ts does. Sending the
      // schema and asking the model not to use it is advice; not sending it is a
      // guarantee. Testing the advice version tests a loop we no longer run.
      ...(withTools ? { tools: ANSWER_TOOLS } : {}),
      max_tokens: 2048,
      temperature: 0.3,
      reasoning: { enabled: false },
      provider: { only: PROVIDERS, data_collection: "deny", zdr: true },
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`OpenRouter: ${JSON.stringify(data.error ?? res.status).slice(0, 300)}`);
  }
  return data.choices?.[0]?.message;
}

interface Answer {
  text: string;
  sources: string[];
  dropped: number;
  work: string[];
  allowed: Set<string>;
  /** The model asked the reader a question instead of answering. */
  askedReader: boolean;
}

async function ask(question: string): Promise<Answer> {
  const allowed = new Set<string>();
  const work: string[] = [];
  const messages: ChatMessage[] = [
    // `today` is passed the way answer.ts passes it: without it the model dates
    // "recent" and "this week" from its own training cutoff.
    { role: "system", content: buildSystemPrompt({ today: TODAY }) },
    { role: "user", content: question },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const isFinalRound = round === MAX_TOOL_ROUNDS;
    const message = await callModel(
      isFinalRound
        ? [...messages, { role: "user", content: FINAL_ROUND_INSTRUCTION }]
        : messages,
      !isFinalRound,
    );
    const calls = message?.tool_calls ?? [];
    if (calls.length === 0) {
      const text = message?.content ?? "";
      if (text.trim().length === 0) break;
      return { ...resolveAnswer(text, allowed), work, allowed, askedReader: false };
    }
    messages.push({ role: "assistant", content: message.content ?? null, tool_calls: calls });

    // ask_reader ENDS the turn — the reader's reply would be the next turn. Handled
    // before the tool loop because there is nothing to append to the transcript.
    const askCall = calls.find(
      (c: { function: { name: string } }) => c.function.name === "ask_reader",
    );
    if (askCall) {
      let asked = "";
      let why = "";
      try {
        const parsed = JSON.parse(askCall.function.arguments || "{}");
        asked = typeof parsed.question === "string" ? parsed.question : "";
        why = typeof parsed.why === "string" ? parsed.why : "";
      } catch {
        asked = "";
      }
      if (asked.trim().length > 0) {
        work.push(`ask · ${why || "needs one detail before answering"}`);
        const prose = why.trim().length > 0 ? `${why.trim()}\n\n${asked.trim()}` : asked.trim();
        return { ...resolveAnswer(prose, allowed), work, allowed, askedReader: true };
      }
      messages.push({
        role: "tool",
        tool_call_id: askCall.id,
        content: "ERROR: 'question' is required and must be a non-empty string.",
      });
    }

    for (const call of calls) {
      let args: Filters = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: "Your arguments were not valid JSON. Send a JSON object.",
        });
        continue;
      }
      const name = String(args.name ?? "");
      let result: string;

      if (call.function.name === "describe_dataset") {
        result = isDatasetName(name) ? describeDataset(name) : `Unknown dataset '${name}'.`;
        work.push(`describe ${name}`);
      } else if (call.function.name === "fetch_dataset") {
        if (!isDatasetName(name)) {
          result = `ERROR: Unknown dataset '${name}'.`;
          work.push(`fetch ${name} · unknown dataset`);
        } else {
          const validated = validateFilters(name as DatasetName, args.filters ?? {});
          if (!validated.ok) {
            result = `ERROR (your call was invalid — this says nothing about what we hold): ${validated.error}`;
            work.push(`fetch ${name} · invalid request, retrying`);
          } else {
            const limit = typeof args.limit === "number" ? args.limit : 20;
            const served = serveFetch(name as DatasetName, validated.filters, limit);
            if ("ok" in served) {
              result = `ERROR (your call was invalid — this says nothing about what we hold): ${served.error}`;
              work.push(`fetch ${name} · refused`);
            } else {
              for (const r of served.rows) allowed.add(r._cite as string);
              result = payloadFor(served.rows, served.report);
              work.push(`fetch ${name} · ${workLogLabel(served.report)}`);
            }
          }
        }
      } else if (call.function.name === "search_web") {
        // Phase 5's tool is present; this harness never lets it reach the web.
        result = "ERROR: web search is disabled in this check.";
        work.push(`web (blocked) · ${String(args.reason ?? "")}`);
      } else if (call.function.name === "ask_reader") {
        // Reached only when the ask was malformed and already answered above.
        continue;
      } else {
        result = `Unknown tool '${call.function.name}'.`;
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: result });
    }
  }
  return { text: "(gave up)", sources: [], dropped: 0, work, allowed, askedReader: false };
}

// ---------------------------------------------------------------------------
// CLAIM DETECTION. Each helper looks for one KIND of claim, in the sentence that
// carries it, so an honest sentence elsewhere in the answer cannot fail a check.
// ---------------------------------------------------------------------------

/**
 * Bill labels are made of full stops — "H.R. 1", "H.J.Res. 143" — so a naive
 * sentence split cuts "the most recent is H.R. 10152" in two and the check that
 * looks for a superlative NEXT TO a bill name finds neither next to the other.
 * The space after a known abbreviation is protected before splitting.
 */
const ABBREVIATIONS =
  /\b(H\.R\.|H\.J\.Res\.|H\.Con\.Res\.|H\.Res\.|S\.J\.Res\.|S\.Con\.Res\.|S\.Res\.|S\.|No\.|Rept\.|Rep\.|Sen\.|Mr\.|Ms\.|Dr\.|e\.g\.|i\.e\.)\s/g;

/** Sentences, with any [[...]] directive line attached to the sentence above it. */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.replace(ABBREVIATIONS, "$1\u0000").split(/\n+/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const restore = (s: string) => s.replace(/\u0000/g, " ").trim();
    if (/^\[\[/.test(trimmed) && out.length > 0) {
      out[out.length - 1] += ` ${restore(trimmed)}`;
      continue;
    }
    for (const s of trimmed.split(/(?<=[.!?])\s+/)) {
      if (restore(s) !== "") out.push(restore(s));
    }
  }
  return out;
}

/** Assertions that a set is EMPTY. Hedges are handled by DISCLAIMED below. */
const ABSENCE_PATTERNS: RegExp[] = [
  /\bthere (?:are|were|is|was|have been|has been) (?:no|none|not a single|zero)\b/i,
  /\b(?:no|zero)\s+(?:\w+[- ]){0,3}(?:measures|bills|laws|resolutions)\s+(?:have|has|had|were|was|became|matched|exist|moved)/i,
  /\bnone (?:have|has|had|did|were|was|exist|moved)\b/i,
  /\bnot a single (?:measure|bill|law|resolution)\b/i,
  /\bnothing (?:has|had|have) (?:moved|happened|advanced|changed|been)\b/i,
  /\bno (?:measures|bills|laws|resolutions|activity|action) (?:at all|whatsoever)\b/i,
  /\bwe (?:found|have) (?:no|none|zero)\b/i,
  // "There hasn't been any activity this week." The contracted negative is not a
  // softer claim than "there was no activity", and the pattern above misses it
  // because its verb list has no contractions.
  /\bthere (?:has|have|had)(?:n't| not) been (?:any|a single|much)\b/i,
  // "I found no measures with action in the past week." First person, and no
  // verb after the noun for the pattern above to hang on. The object is pinned
  // to a thing we hold so that "I have no way of knowing" — an honest sentence,
  // and the one we want instead — cannot trip it.
  /\b(?:i|we) (?:found|see|saw|have|could find|can find|am seeing)\s+(?:no|zero)\s+(?:\w+[- ]){0,3}(?:measures|bills|laws|resolutions|activity|action|results|movement|records)\b/i,
];

/**
 * "None of them" takes its scope from a pronoun, and when the sentence says
 * whose rows it means — "from the sample I did see, none of them show an action
 * after introduction" — it is a statement about those rows, which the contract
 * allows. Unscoped, it is a claim about the set, which it does not.
 */
const PRONOUN_ABSENCE = /\bnone of (?:them|these|those)\b/i;
const SAMPLE_SCOPED =
  /\b(?:sample|the rows I|the ones I|among the (?:measures|bills|rows|results) I|what I (?:did see|could see|retrieved))\b/i;

/**
 * A sentence that disclaims its own absence: "that does not mean none exist",
 * "an empty result is not evidence that there are none". The system prompt asks
 * for exactly this — the caveat in the SAME sentence as the claim it limits — so
 * a check that failed it would be punishing the behaviour we want. This is
 * narrow on purpose: a blanket negation test would excuse "there were no
 * measures this week, so I cannot tell you more", which is the defect.
 */
const DISCLAIMED =
  /\b(?:does|do|did|would)(?: not|n't) mean\b|\b(?:is|are)(?: not|n't) evidence\b|\bnot proof\b|\bcan(?:not|'t) conclude\b/i;

export function claimsAbsence(text: string): string | null {
  for (const s of sentences(text)) {
    if (DISCLAIMED.test(s)) continue;
    if (ABSENCE_PATTERNS.some((re) => re.test(s))) return s;
    if (PRONOUN_ABSENCE.test(s) && !SAMPLE_SCOPED.test(s)) return s;
  }
  return null;
}

const COUNT_PATTERN =
  /\b(?:\d[\d,]*|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:\w+[- ]){0,3}(?:measures|bills|laws|resolutions)\b/i;

/**
 * A count claim ABOUT THE ASKED SET. Scoped by `subject` because a complete total
 * quoted from another dataset ("the 119th Congress holds 18,476 measures") is a
 * legitimate sentence and must not fail a check about a different set.
 */
export function statesCount(text: string, subject: RegExp): string | null {
  for (const s of sentences(text)) {
    if (subject.test(s) && COUNT_PATTERN.test(s)) return s;
  }
  return null;
}

/**
 * A SUPERLATIVE CLAIM, in either of the two shapes English offers: "H.R. 1 is the
 * most recent" and "the most recent is H.R. 1".
 *
 * Not matched, on purpose: "H.R. 9710, whose latest recorded action was
 * 2026-07-15". Each row carries its own latestActionDate, and repeating a row's
 * own field is a row-level fact the contract permits. What it forbids is ranking
 * the rows against each other, or against the set they were drawn from.
 *
 * That exemption is enforced by ROW_LEVEL_SUPERLATIVE below rather than by the
 * shape of the patterns, because it cannot be done with them: "latest recorded
 * action was" satisfies the second pattern word for word, so this check used to
 * fail the very sentence its own comment promised to allow.
 */
const SET_SUPERLATIVE: RegExp[] = [
  /\b(?:is|was|are|were|has|have|had|remains)\s+(?:\w+\s+){0,2}?(?:most recent(?:ly)?|latest|newest)\b/i,
  /\b(?:most recent(?:ly)?|latest|newest)\s+(?:\w+\s+){0,3}?(?:is|was|are|were|belongs|goes)\b/i,
  // Explicitly ranking the rows against each other. "The most recent date among
  // the measures I retrieved" is a maximum derived from an arbitrary page, which
  // is the move `order_meaning` forbids in as many words — the hedge names the
  // sample but still hands the reader a winner.
  /\b(?:most recent(?:ly)?|latest|newest|earliest|oldest)\s+(?:\w+\s+){0,2}?(?:among|out of|of the (?:measures|bills|rows|results|ones))\b/i,
];

/**
 * A superlative belonging to ONE row: "whose latest recorded action", "its most
 * recent action", "H.R. 1's latest action". Removed from the sentence before the
 * patterns above run, so the fact survives and only a comparison can fail.
 */
const ROW_LEVEL_SUPERLATIVE =
  /\b(?:whose|its|their|his|her|'s)\s+(?:most recent(?:ly)?|latest|newest)\b/gi;

const RECENCY_PATTERN =
  /\b(?:most recent(?:ly)?|latest|newest|last to (?:move|act)|has moved most)\b/i;

/**
 * Refusing to name one is the CORRECT answer here, and it is written with the
 * same words as the wrong one — "H.R. 9710 is not necessarily the most recent"
 * names the bill and the superlative in one sentence. So a negated sentence is
 * not a hit: what this looks for is a bill named DEFINITIVELY as the newest.
 */
const NEGATION_PATTERN =
  /\b(?:not|never|cannot|can't|couldn't|could not|unable|unclear|unknown|n't|isn't|aren't|no way)\b/i;

/** Names a specific row as the newest — the claim `order: "arbitrary"` forbids. */
export function namesOneAsNewest(text: string): string | null {
  const references = ARBITRARY_PAGE.flatMap((b) => [b.label, b.billId, b.title]);
  for (const s of sentences(text)) {
    // The row's own fields are struck out first: what is left is the ranking.
    const claim = s.replace(ROW_LEVEL_SUPERLATIVE, " ");
    if (!RECENCY_PATTERN.test(claim)) continue;
    if (NEGATION_PATTERN.test(claim)) continue;
    if (!SET_SUPERLATIVE.some((re) => re.test(claim))) continue;
    if (references.some((r) => s.includes(r))) return s;
  }
  return null;
}

/**
 * Our plumbing, in the reader's answer. answerSanitize.ts deletes the paragraph
 * that carries one of these before publication, so this check is about the cost
 * of that deletion: a leak here means the reader loses a paragraph they needed.
 */
const INTERNAL_WORDS = ["total_matching", "truncated", "dataset", "fetch_dataset", "rows returned"];

/**
 * `complete`, `order` and `shown` are also our field names, but unlike the words
 * above they are ordinary English — "I could not get a complete answer" is a good
 * sentence and "in order to" is not a leak. What leaks is the FIELD: the model
 * quoting `complete: false` or `order: "arbitrary"` at the reader as evidence.
 * That exact move shipped, as "The result says truncated: false" offered to a
 * reader as reassurance for an answer that was wrong.
 */
const FIELD_LITERAL = /\b(?:complete|order|shown)\s*[:=]\s*["'`]?\w/i;

export function leaksVocabulary(text: string): string | null {
  for (const s of sentences(text)) {
    for (const word of INTERNAL_WORDS) {
      // Word-ish boundaries plus an optional plural, as answerSanitize.ts does:
      // they stop "truncated" firing inside "untruncated" and catch "our datasets".
      if (new RegExp(`\\b${word}s?\\b`, "i").test(s)) return `${word}: ${s}`;
    }
    if (FIELD_LITERAL.test(s)) return `field name quoted at the reader: ${s}`;
  }
  return null;
}

let failures = 0;
function check(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) {
    failures++;
    console.log(`      ${detail}`);
  }
}

function report(title: string, answer: Answer) {
  console.log(`\n--- ${title} ---`);
  console.log(answer.text.slice(0, 900));
  console.log(`work: ${answer.work.join(" | ")}`);
  if (answer.askedReader) console.log("(the model asked the reader a question instead)");
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("Set OPENROUTER_API_KEY");
    process.exit(1);
  }
  console.log(`model=${MODEL} providers=${PROVIDERS.join(",")} today=${TODAY}\n`);
  const answers: Array<[string, Answer]> = [];

  // THE GATE
  // Asking for something we genuinely do not hold must produce an admission,
  // never a number. If this fails, the fix is stronger `gotchas` in
  // convex/catalog/datasets.ts — not a prompt patch elsewhere.
  const cosponsors = await ask("How many co-sponsors does H.R. 1 have in the 119th Congress?");
  answers.push(["co-sponsors", cosponsors]);
  report("co-sponsor question", cosponsors);
  // "doesn't track" is as good an admission as "don't track", and the narrower
  // pattern failed a correct answer for saying it the other way round.
  const admits =
    /\b(?:do(?:es)?(?: not|n't)|did(?: not|n't))\s+(?:\w+\s+){0,2}(?:have|hold|track|store|carry|record)/i.test(
      cosponsors.text,
    ) ||
    // The passive says the same thing: "co-sponsors are not tracked anywhere in
    // what we hold" is the admission this gate is for.
    /\bn(?:ot|ever)\s+(?:\w+\s+){0,2}(?:tracked|held|stored|recorded|carried|captured|included)\b/i.test(
      cosponsors.text,
    ) ||
    /not (?:in our|something we|part of what we|information we)|isn't in our|is not in our|no co-?sponsor/i.test(
      cosponsors.text,
    );
  const inventedNumber = /\b\d+\s+co-?sponsors?\b/i.test(cosponsors.text);
  check("admits we do not hold co-sponsors", admits, cosponsors.text.slice(0, 300));
  check("does NOT state a co-sponsor count", !inventedNumber, cosponsors.text.slice(0, 300));
  check("dropped no invented citations", cosponsors.dropped === 0, `dropped=${cosponsors.dropped}`);

  // Grounded answer over a COMPLETE result. The fix for the audit must not be
  // "refuse everything": when the whole set was read, the exact total is the
  // answer and the model is expected to say it.
  const health = await ask("How many health bills are there in the 119th Congress?");
  answers.push(["health bills", health]);
  report("health-bills question", health);
  check("used at least one tool", health.work.length > 0, "no tool calls");
  check("cited at least one real source", health.sources.length > 0, "no sources");
  check("dropped no invented citations", health.dropped === 0, `dropped=${health.dropped}`);
  check(
    "no raw markers survived",
    !health.text.includes("[[cite:"),
    "raw [[cite: marker left in prose",
  );
  check(
    "did not reach for the web when our data answers it",
    !health.work.some((w) => w.startsWith("web")),
    health.work.join(" | "),
  );
  check(
    "states the exact total from the complete result",
    new RegExp(`\\b${HEALTH_TOTAL.toLocaleString("en-US")}\\b|\\b${HEALTH_TOTAL}\\b`).test(
      health.text,
    ),
    `expected ${HEALTH_TOTAL} in: ${health.text.slice(0, 300)}`,
  );

  // An INCOMPLETE result with zero rows. Every date filter lands in memory over a
  // capped window, so an empty answer here means "we did not look everywhere" —
  // and 86 measures really were acted on in the last week of August 2026. Claiming
  // "nothing has moved" is the defect that shipped as "no Texas bills became law".
  const moved = await ask("Has anything in the 119th Congress moved in the past week?");
  answers.push(["recent movement", moved]);
  report("incomplete-result question", moved);
  const absence = claimsAbsence(moved.text);
  check("does NOT claim the set is empty", absence === null, `claimed absence: ${absence}`);
  const counted = statesCount(moved.text, /\b(?:week|days?|recent|since|august|moved|action)\b/i);
  check("does NOT state a count it cannot have", counted === null, `stated a count: ${counted}`);

  // order: "arbitrary". The rows are a page in database order, the newest sits in
  // the middle of it, and the audit found the model naming a "most recent" bill
  // while a later row in its own result carried a later date.
  const newest = await ask(
    "Which measure in the 119th Congress has had the most recent action? Just name it.",
  );
  answers.push(["most recent", newest]);
  report("arbitrary-order question", newest);
  const named = namesOneAsNewest(newest.text);
  check("does NOT name a row as the most recent", named === null, `named one: ${named}`);

  // Our field names are not the reader's vocabulary. Checked on every answer.
  for (const [title, answer] of answers) {
    const leak = leaksVocabulary(answer.text);
    check(`${title}: no internal vocabulary in the prose`, leak === null, `leaked ${leak}`);
  }

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

/**
 * Run the live gate only when this file IS the entry point.
 *
 * scripts/check-grounding.test.ts imports the fixture and the claim detectors
 * above to exercise them offline; an unguarded call here would fire the whole
 * gate — and exit(1) on the missing API key — the moment that file loaded.
 */
if (/check-grounding\.ts$/.test(process.argv[1] ?? "")) void main();
