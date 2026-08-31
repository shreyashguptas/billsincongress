/**
 * The question set and the ORACLE for the answer-accuracy harness.
 *
 * INDEPENDENCE IS THE POINT. Every expected value below is computed here, from
 * raw rows, by loops written by hand. Nothing in this file imports the answer
 * engine: not fetchDataset, not runFetch, not a catalog, not a filter. A harness
 * built on the code it is checking agrees with every bug in that code — it would
 * have reported all 41 defects in the 2026-08-30 audit as passing, because each
 * one WAS what fetchDataset returned. So when you are tempted to reuse a helper
 * from convex/, don't: copy the four lines instead.
 *
 * Each question names the falsehood it exists to catch. Those are not
 * hypotheticals; every one of them was shipped to a reader with citations
 * attached.
 *
 * NOT part of `pnpm test` — the oracle needs .truth-cache/, and the questions
 * are only meaningful when asked of production. Named questions.ts, not
 * questions.test.ts, so the suite's *.test.ts discovery cannot pick it up.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CACHE_DIR = ".truth-cache";

/** The Congress readers are asking about; 118 and 117 are closed history. */
const CURRENT_CONGRESS = 119;

/**
 * Sine die adjournment. Not in any table we hold, and the reason "how many
 * 118th-Congress bills are still in committee" has the answer zero: a Congress
 * that has ended has nothing pending. Every unfinished bill died, it is not
 * waiting. The model answered with the size of the dead pile.
 */
const CONGRESS_ADJOURNED: Record<number, string> = {
  117: "2023-01-03",
  118: "2025-01-03",
};

// ---------------------------------------------------------------------------
// Raw rows, exactly as production stores them
// ---------------------------------------------------------------------------

export interface BillRow {
  billId: string;
  billType: string;
  billNumber: string;
  billTypeLabel: string;
  congress: number;
  progressStage?: number;
  progressDescription?: string;
  policyAreaName?: string;
  sponsorState?: string;
  sponsorFirstName?: string;
  sponsorLastName?: string;
  introducedDate?: string;
  latestActionDate?: string;
  title?: string;
}

export interface SponsorRow {
  congress: number;
  sponsorName: string;
  sponsorState: string;
  sponsorParty?: string;
  billCount: number;
}

export interface PolicyAreaRow {
  congress: number;
  policyAreaName: string;
  count: number;
}

export interface StatsRow {
  congress: number;
  totalCount: number;
  houseCount: number;
  senateCount: number;
  stageCounts: Array<{ stage: number; count: number; description: string }>;
}

export interface ActionRow {
  billId: string;
  actionDate: string;
  text: string;
  sourceSystemName?: string;
}

export interface RawDb {
  bills: BillRow[];
  billActions: ActionRow[];
  congressSponsors: SponsorRow[];
  congressStats: StatsRow[];
  congressPolicyAreas: PolicyAreaRow[];
}

export const CACHE_MISSING_MESSAGE =
  `No ${CACHE_DIR}/ found. The oracle scores production against a local copy of ` +
  `production's raw tables. Create it with:\n` +
  `  export $(grep -E '^CONVEX_DEPLOY_KEY=' <main-checkout>/.env | xargs)\n` +
  `  ./node_modules/.bin/tsx scripts/truth/dump.ts`;

/** Same on-disk format as scripts/truth/fakedb.ts: one JSON document per line. */
function readTable<T>(name: string): T[] {
  const path = join(CACHE_DIR, `${name}.jsonl`);
  if (!existsSync(path)) throw new Error(CACHE_MISSING_MESSAGE);
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

let cached: RawDb | null = null;

/** Cached across calls: bills is 55,619 rows and every question reads it. */
export function loadRawDb(): RawDb {
  if (cached) return cached;
  cached = {
    bills: readTable<BillRow>("bills"),
    billActions: readTable<ActionRow>("billActions"),
    congressSponsors: readTable<SponsorRow>("congressSponsors"),
    congressStats: readTable<StatsRow>("congressStats"),
    congressPolicyAreas: readTable<PolicyAreaRow>("congressPolicyAreas"),
  };
  return cached;
}

// ---------------------------------------------------------------------------
// Oracle helpers — deliberately dumb, deliberately local
// ---------------------------------------------------------------------------

/** Stage 100 is "Became Law". */
const BECAME_LAW = 100;
/** Stage 60 is "Passed One Chamber" — a MILESTONE, not a resting place. */
const PASSED_A_CHAMBER = 60;
/** Stage 40 is "In Committee". */
const IN_COMMITTEE = 40;

/** Chamber of origin, which is what the bill's type letter encodes. */
function isHouseMeasure(b: BillRow): boolean {
  return b.billType.startsWith("h");
}
function isSenateMeasure(b: BillRow): boolean {
  return b.billType.startsWith("s");
}

/**
 * A BILL, as opposed to a resolution. Readers asking "how many bills were
 * introduced" mean hr and s; congressStats.totalCount counts all eight types,
 * which is how 18,476 got reported as the number of bills in the 119th when it
 * is the number of measures.
 */
function isBill(b: BillRow): boolean {
  return b.billType === "hr" || b.billType === "s";
}

function billsIn(db: RawDb, congress: number): BillRow[] {
  return db.bills.filter((b) => b.congress === congress);
}

function count<T>(rows: T[], pred: (row: T) => boolean): number {
  let n = 0;
  for (const row of rows) if (pred(row)) n++;
  return n;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

export interface Expected {
  kind: "number" | "billId" | "name" | "boolean";
  value: string | number | boolean;
  /**
   * Only for `number`, and only where the underlying fact is genuinely fuzzy in
   * OUR data (see senate-passed-a-chamber). Never widen a tolerance to make a
   * failing question pass: that converts a shipped falsehood into a green check,
   * which is the one outcome worse than having no harness.
   */
  tolerance?: number;
  /** How this number was derived, and which wrong numbers it must reject. */
  note: string;
}

export interface TruthQuestion {
  id: string;
  question: string;
  /** Set for questions asked from a bill page, so the model gets the context. */
  focusBillId?: string;
  expect: (db: RawDb) => Expected;
  /** The falsehood this question exists to catch. */
  defect: string;
}

/**
 * Answer-shape directives.
 *
 * These are not politeness. scripts/truth/extract.ts refuses to score an answer
 * that asserts more than one number, because production once wrote "104 House
 * bills became law ... 56 Republican and 8 Democratic" in a single paragraph and
 * any pick-a-number rule would have called that correct. A plain "how many bills
 * became law" answer volunteers six more counts as context, so without a shape
 * directive nearly every question scores UNCHECKABLE and the harness measures
 * nothing. Constraining the SHAPE of the reply does not constrain the LOOKUP,
 * which is where every defect lives.
 */
const ONE_NUMBER = " Answer with just the number, in one short sentence.";
const ONE_NAME = " Answer with just the name, in one short sentence.";
const ONE_BILL = " Answer with just the bill, in one short sentence.";
const YES_OR_NO = " Answer yes or no, in one short sentence.";

export const QUESTIONS: TruthQuestion[] = [
  // --- Superlatives over an arbitrarily ordered page ------------------------
  {
    id: "most-recent-law",
    question: "Which bill most recently became law?" + ONE_BILL,
    defect:
      "Named a 'most recent' law off the top of an unsorted result while a later " +
      "row in that same result carried a later date.",
    expect: (db) => {
      const laws = db.bills.filter((b) => b.progressStage === BECAME_LAW);
      let latest = laws[0];
      for (const b of laws) {
        if ((b.latestActionDate ?? "") > (latest.latestActionDate ?? "")) latest = b;
      }
      return {
        kind: "billId",
        value: latest.billId,
        note:
          `Max latestActionDate over all ${laws.length} rows at stage 100 across every ` +
          `Congress we hold: ${latest.billTypeLabel}${latest.billNumber} on ` +
          `${latest.latestActionDate}. Row order is not date order, so any answer that ` +
          `matches only by luck of position is still the defect.`,
      };
    },
  },

  // --- Set-level counts read off the wrong set ------------------------------
  {
    id: "house-laws",
    question:
      `Of the laws enacted in the ${CURRENT_CONGRESS}th Congress, how many started in ` +
      `the House?` + ONE_NUMBER,
    defect: "Shipped '104 House bills became law'. 104 is both chambers.",
    expect: (db) => {
      const laws = billsIn(db, CURRENT_CONGRESS).filter((b) => b.progressStage === BECAME_LAW);
      return {
        kind: "number",
        value: count(laws, isHouseMeasure),
        note:
          `Stage-100 rows in the ${CURRENT_CONGRESS}th whose type starts with 'h' ` +
          `(hr and hjres). Must reject 104, which is the both-chambers total.`,
      };
    },
  },
  {
    id: "senate-laws",
    question:
      `Of the laws enacted in the ${CURRENT_CONGRESS}th Congress, how many started in ` +
      `the Senate?` + ONE_NUMBER,
    defect: "The other half of the 104-is-both-chambers error.",
    expect: (db) => {
      const laws = billsIn(db, CURRENT_CONGRESS).filter((b) => b.progressStage === BECAME_LAW);
      return {
        kind: "number",
        value: count(laws, isSenateMeasure),
        note:
          `Stage-100 rows in the ${CURRENT_CONGRESS}th whose type starts with 's' ` +
          `(s and sjres). House + Senate must come to the control's 104.`,
      };
    },
  },
  {
    id: "senate-passed-a-chamber",
    question:
      `How many Senate bills in the ${CURRENT_CONGRESS}th Congress have passed the ` +
      `Senate?` + ONE_NUMBER,
    defect:
      "Answered with the terminal 'Passed One Chamber' bucket (194, and both " +
      "chambers at that), treating a milestone as a resting place: a bill that " +
      "went on to become law has still passed the Senate.",
    expect: (db) => {
      const senateBills = billsIn(db, CURRENT_CONGRESS).filter((b) => b.billType === "s");
      const milestone = count(senateBills, (b) => (b.progressStage ?? 0) >= PASSED_A_CHAMBER);
      // Our own progressStage misses 10 S. bills that were introduced, read
      // three times and passed the same day: their actions say "Passed Senate"
      // while their stage still says Introduced. Both 176 and 186 are defensible
      // readings of OUR data, so the band spans them and nothing else. It does
      // not reach 194 (the all-chamber terminal bucket) or 142 (the Senate
      // terminal bucket), which are the two wrong answers.
      return {
        kind: "number",
        value: milestone,
        tolerance: 10,
        note:
          `${milestone} S. bills sit at stage 60 or beyond. Ten more have a "Passed ` +
          `Senate" action but a stale stage, hence the band. Must reject 194 (all ` +
          `chambers, terminal bucket) and 142 (Senate terminal bucket).`,
      };
    },
  },
  {
    id: "bills-introduced",
    question:
      `How many bills — not resolutions — have been introduced in the ` +
      `${CURRENT_CONGRESS}th Congress?` + ONE_NUMBER,
    defect:
      "Quoted congressStats.totalCount (18,476) as the number of bills. That " +
      "counts all eight measure types, resolutions included.",
    expect: (db) => {
      const measures = billsIn(db, CURRENT_CONGRESS);
      return {
        kind: "number",
        value: count(measures, isBill),
        note:
          `hr + s only, out of ${measures.length} measures of all eight types. Must ` +
          `reject ${measures.length}.`,
      };
    },
  },

  // --- Confident zeroes over a capped, in-memory-filtered window ------------
  {
    id: "health-laws",
    question:
      `How many bills whose policy area is Health became law in the ` +
      `${CURRENT_CONGRESS}th Congress?` + ONE_NUMBER,
    defect:
      "Answered zero. The newest rows read were all still in committee, and the " +
      "handler called that sample complete.",
    expect: (db) => {
      const n = count(
        billsIn(db, CURRENT_CONGRESS),
        (b) => b.policyAreaName === "Health" && b.progressStage === BECAME_LAW,
      );
      const health = count(billsIn(db, CURRENT_CONGRESS), (b) => b.policyAreaName === "Health");
      return {
        kind: "number",
        value: n,
        note:
          `${n} of the ${CURRENT_CONGRESS}th's ${health} Health bills reached stage 100. ` +
          `Must reject 0.`,
      };
    },
  },
  {
    id: "texas-laws",
    question:
      `Have any bills sponsored by Texas members become law in the ` +
      `${CURRENT_CONGRESS}th Congress?` + YES_OR_NO,
    defect:
      "Told the reader \"we don't have data on Texas bills that became law\" when " +
      "eleven had. Absence in a sample was reported as absence in the world.",
    expect: (db) => {
      const n = count(
        billsIn(db, CURRENT_CONGRESS),
        (b) => b.sponsorState === "TX" && b.progressStage === BECAME_LAW,
      );
      return {
        kind: "boolean",
        value: n > 0,
        note: `${n} Texas-sponsored bills are at stage 100. Anything that denies or hedges is the defect.`,
      };
    },
  },
  {
    id: "eighteenth-still-in-committee",
    question:
      "Are any bills from the 118th Congress still sitting in committee, waiting " +
      "for action?" + YES_OR_NO,
    defect:
      "Reported tens of thousands of 118th-Congress bills as 'still in committee'. " +
      "That Congress adjourned on 2025-01-03; those bills did not stall, they died.",
    expect: (db) => {
      const stranded = count(billsIn(db, 118), (b) => b.progressStage === IN_COMMITTEE);
      const adjourned = CONGRESS_ADJOURNED[118];
      const stillSitting = today() > adjourned ? 0 : stranded;
      return {
        kind: "boolean",
        value: stillSitting > 0,
        note:
          `The 118th adjourned ${adjourned}, before today (${today()}), so nothing in it ` +
          `is pending. Its ${stranded.toLocaleString("en-US")} committee-stage rows are ` +
          `bills that died there — an answer that offers that number as a live backlog ` +
          `is the defect.`,
      };
    },
  },

  // --- Members: the invisible-sponsor family --------------------------------
  {
    id: "california-fewest-bills",
    question:
      `Which California member of the ${CURRENT_CONGRESS}th Congress has introduced ` +
      `the fewest bills?` + ONE_NAME,
    defect:
      "Answered Tom McClintock (25). The real minimum is James Gallagher (5); 25 " +
      "of California's members were never read, and the model justified the answer " +
      "out loud with \"truncated: false ... meaning all matching rows were returned\".",
    expect: (db) => {
      const ca = db.congressSponsors.filter(
        (s) => s.congress === CURRENT_CONGRESS && s.sponsorState === "CA",
      );
      let fewest = ca[0];
      for (const s of ca) if (s.billCount < fewest.billCount) fewest = s;
      return {
        kind: "name",
        value: fewest.sponsorName,
        note:
          `Minimum billCount over all ${ca.length} California sponsor rows: ` +
          `${fewest.sponsorName} with ${fewest.billCount}. Must reject Tom McClintock.`,
      };
    },
  },
  {
    id: "california-member-count",
    question:
      `How many California members introduced bills in the ${CURRENT_CONGRESS}th ` +
      `Congress?` + ONE_NUMBER,
    defect:
      "Reported a number drawn from a capped page, so a superlative was computed " +
      "over roughly half the delegation without saying so.",
    expect: (db) => {
      const n = count(
        db.congressSponsors,
        (s) => s.congress === CURRENT_CONGRESS && s.sponsorState === "CA",
      );
      return {
        kind: "number",
        value: n,
        note: `California sponsor rows in the ${CURRENT_CONGRESS}th. Must reject 29, the size of the page that was actually read.`,
      };
    },
  },
  {
    id: "two-word-surname",
    question:
      `How many bills has Monica De La Cruz introduced in the ${CURRENT_CONGRESS}th ` +
      `Congress?` + ONE_NUMBER,
    defect:
      "Reported zero for members with multi-word surnames, because the name was " +
      "matched against a field that stores it differently.",
    expect: (db) => {
      const row = db.congressSponsors.find(
        (s) => s.congress === CURRENT_CONGRESS && s.sponsorName === "Monica De La Cruz",
      );
      if (!row) {
        throw new Error(
          "Monica De La Cruz has no sponsor row in the cache. Either the dump is stale " +
            "or she is genuinely absent — check before weakening this question.",
        );
      }
      return {
        kind: "number",
        value: row.billCount,
        note: `congressSponsors.billCount for her ${CURRENT_CONGRESS}th-Congress row. Must reject 0.`,
      };
    },
  },

  // --- Page context: the answer must be about THIS bill --------------------
  {
    id: "focused-bill-sponsor",
    // The most recent law, so the question is about a bill whose page a reader
    // would plausibly be on when they ask.
    focusBillId: "629s119",
    question: "Who sponsored this bill?" + ONE_NAME,
    defect:
      "Answered about a different bill than the one the reader had open. " +
      "Reproduced in 2 runs out of 3, which is why every question here is asked " +
      "three times.",
    expect: (db) => {
      const bill = db.bills.find((b) => b.billId === "629s119");
      if (!bill) throw new Error("629s119 is not in the cache; re-run dump.ts.");
      return {
        kind: "name",
        value: `${bill.sponsorFirstName} ${bill.sponsorLastName}`,
        note:
          `Sponsor of ${bill.billTypeLabel}${bill.billNumber} (${bill.title}). Naming any ` +
          `other member means the answer was about another bill.`,
      };
    },
  },

  // --- Controls -------------------------------------------------------------
  // Production answers these correctly today. If they ever go red at the same
  // time as everything else, suspect the harness — a checker that reports the
  // whole system broken is usually the thing that is broken.
  {
    id: "control-total-laws",
    question:
      `How many bills have become law in the ${CURRENT_CONGRESS}th Congress?` + ONE_NUMBER,
    defect: "CONTROL — answered correctly in the audit. Not a known defect.",
    expect: (db) => {
      const fromRows = count(billsIn(db, CURRENT_CONGRESS), (b) => b.progressStage === BECAME_LAW);
      const stats = db.congressStats.find((s) => s.congress === CURRENT_CONGRESS);
      const fromStats =
        stats?.stageCounts.find((s) => s.stage === BECAME_LAW)?.count ?? -1;
      if (fromRows !== fromStats) {
        throw new Error(
          `The control disagrees with itself: ${fromRows} stage-100 bill rows but ` +
            `congressStats says ${fromStats}. Fix the data before trusting any score.`,
        );
      }
      return {
        kind: "number",
        value: fromRows,
        note: `Agreed by two independent tables: stage-100 bill rows and congressStats.stageCounts.`,
      };
    },
  },
  {
    id: "control-largest-topic",
    question:
      `Which policy area has the most bills in the ${CURRENT_CONGRESS}th Congress?` + ONE_NAME,
    defect: "CONTROL — answered correctly in the audit. Not a known defect.",
    expect: (db) => {
      const areas = db.congressPolicyAreas.filter((a) => a.congress === CURRENT_CONGRESS);
      let biggest = areas[0];
      for (const a of areas) if (a.count > biggest.count) biggest = a;
      return {
        kind: "name",
        value: biggest.policyAreaName,
        note: `Max count over ${areas.length} policy-area rows: ${biggest.policyAreaName} (${biggest.count}).`,
      };
    },
  },
];
