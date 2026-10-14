/**
 * Single source of truth for bill progress stages and stage derivation.
 * Intentionally PURE (no Convex imports) so it can be unit tested and imported
 * anywhere on the backend — keep it the only definition of "stage".
 */

export const BillStages = {
  INTRODUCED: 20,
  IN_COMMITTEE: 40,
  OUT_OF_COMMITTEE: 50,
  PASSED_ONE_CHAMBER: 60,
  PASSED_BOTH_CHAMBERS: 80,
  VETOED: 85,
  TO_PRESIDENT: 90,
  SIGNED_BY_PRESIDENT: 95,
  BECAME_LAW: 100,
} as const;

export const BillStageDescriptions: Record<number, string> = {
  [BillStages.INTRODUCED]: "Introduced",
  [BillStages.IN_COMMITTEE]: "In Committee",
  [BillStages.OUT_OF_COMMITTEE]: "Out of Committee",
  [BillStages.PASSED_ONE_CHAMBER]: "Passed One Chamber",
  [BillStages.PASSED_BOTH_CHAMBERS]: "Passed Both Chambers",
  [BillStages.VETOED]: "Vetoed",
  [BillStages.TO_PRESIDENT]: "To President",
  [BillStages.SIGNED_BY_PRESIDENT]: "Signed by President",
  [BillStages.BECAME_LAW]: "Became Law",
};

// Homepage status-chart stages, in display order — chart segments follow this
// array's order.
export const BILL_STAGES: ReadonlyArray<{ stage: number; description: string }> =
  [
    BillStages.INTRODUCED,
    BillStages.IN_COMMITTEE,
    BillStages.OUT_OF_COMMITTEE,
    BillStages.PASSED_ONE_CHAMBER,
    BillStages.PASSED_BOTH_CHAMBERS,
    BillStages.VETOED,
    BillStages.TO_PRESIDENT,
    BillStages.SIGNED_BY_PRESIDENT,
    BillStages.BECAME_LAW,
  ].map((stage) => ({ stage, description: BillStageDescriptions[stage] }));

/** The calendars a measure waits on for a floor vote once no committee holds it. */
const FLOOR_CALENDARS = [
  "placed on the union calendar",
  "placed on the house calendar",
  "placed on the private calendar",
  "placed on senate legislative calendar under general orders",
  // A Senate resolution held a day "over, under the rule" goes straight onto a
  // calendar without a committee, legislative or executive (S.Res. 520, 119th,
  // an executive resolution debated on the floor; found by the calendar-number
  // oracle in scripts/truth/handlers.test.ts).
  "placed on senate legislative calendar under over, under the rule",
  "placed on senate executive calendar",
];

/**
 * Whether an action shows the measure has left committee and waits for the
 * floor. Shared by calculateBillStage and the committee base-rate job.
 *
 * 2,145 measures across the 117th–119th had been reported by their committee
 * or placed on a floor calendar while the site still called them "in
 * committee" (or, for 40 Rule XIV bills in the 119th, "introduced"), counted
 * them in "haven't made it out of committee", and showed them the odds for
 * bills stuck there (S. 2431, the 2026 Interior appropriations
 * bill, was "in committee for 439 days" months after the Senate calendared it).
 *
 * The signal is the floor calendar, not the report. A House bill referred to
 * several committees is reported by each in turn ("H. Rept. 119-431, Part 1")
 * and stays with the others until it is calendared. "Ordered to be reported" is
 * the committee's vote, before the report is filed, and a SUBcommittee being
 * discharged returns the bill to its full committee: neither counts. A Senate
 * report (code 14000) does count, because the Senate places a reported measure
 * on its calendar the same day and does not always record that separately.
 * Rule XIV bills skip committee and are placed on the Senate calendar directly,
 * so they count too. The Senate records that mid-sentence ("Read the second
 * time. Placed on Senate Legislative Calendar under General Orders.", 351
 * actions), so the calendar is matched anywhere in the text, not only at the
 * start (review on #174).
 */
export function leftCommittee(action: { text?: string; actionCode?: string }): boolean {
  const text = (action.text || "").toLowerCase();
  const code = action.actionCode || "";
  return (
    code === "H12410" ||
    code === "H12420" ||
    code === "14000" ||
    FLOOR_CALENDARS.some((c) => text.includes(c))
  );
}

// Returns "house" / "senate" / null. Shared by calculateBillStage and the
// committee base-rate job so both agree on what "passed a chamber" means.
//
// The Library of Congress records every passage as code 8000 ("Passed/agreed
// to in House: ...") or 17000 ("Passed/agreed to in Senate: ..."), and those are
// checked first. The House's own floor log never says "passed House" about a
// bill — it says "On passage Passed by the Yeas and Nays" — so matching only
// that phrase left 3,766 bills that had passed a chamber reading "In Committee"
// or "Introduced" (H.R. 10326 in the 119th, passed 217-207 on
// 16 Sep 2026). The phrase does appear on rules: "Rule H. Res. 864 passed
// House." is the House adopting the terms of debate for H.R. 5894, which never
// passed, so a rule never counts.
export function passedChamber(action: {
  text?: string;
  type?: string;
  actionCode?: string;
}): "house" | "senate" | null {
  const text = (action.text || "").toLowerCase();
  const type = (action.type || "").toLowerCase();
  const code = action.actionCode || "";
  if (code === "8000" || text.startsWith("passed/agreed to in house")) {
    return "house";
  }
  if (code === "17000" || text.startsWith("passed/agreed to in senate")) {
    return "senate";
  }
  const isRule = text.startsWith("rule ");
  if (
    (text.includes("passed house") && !isRule) ||
    type === "passedhouse" ||
    code === "H32500"
  ) {
    return "house";
  }
  if (
    text.includes("passed senate") ||
    type === "passedsenate" ||
    code === "S32500"
  ) {
    return "senate";
  }
  return null;
}

/**
 * Derive a bill's progress stage from its actions.
 *
 * Flag-based with post-loop precedence — there are deliberately NO early
 * returns inside the scan. Library of Congress quirk: action code `E30000` is
 * attached to BOTH "Signed by President" and "Vetoed by President", so an early
 * return on it mislabeled real vetoes as signed into law. `E30000` is never
 * used to detect a signing; a signing is recognised only by its unambiguous
 * "Signed by President" text.
 *
 * Precedence (most advanced first): became law > vetoed > signed > to
 * president > passed both > passed one > out of committee > in committee >
 * introduced. Vetoed
 * outranks signed defensively so a veto can never be reported as a signing.
 */
export function calculateBillStage(
  actions: Array<{
    text: string;
    type?: string;
    actionCode?: string;
    actionDate?: string;
  }>,
): { stage: number; description: string; stageDate: string | null } {
  // Earliest dated action behind each flag below. The stage's date is the
  // first time the bill got there — the day it became law, was vetoed, passed
  // its first chamber — not its latest action: a committee can file paperwork
  // on a bill months after it was signed (H.R. 1043 in the 119th was signed on
  // 29 Dec 2025 and its last action is a report filed on 11 Feb 2026).
  const dates: Record<string, string | null> = {
    becameLaw: null,
    vetoed: null,
    signed: null,
    toPresident: null,
    passedHouse: null,
    passedSenate: null,
    outOfCommittee: null,
    inCommittee: null,
  };
  const saw = (flag: keyof typeof dates, date: string | undefined) => {
    if (!date) return;
    const current = dates[flag];
    if (current === null || date < current) dates[flag] = date;
  };

  const stageResult = (stage: number, stageDate: string | null = null) => ({
    stage,
    description: BillStageDescriptions[stage],
    stageDate,
  });

  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return stageResult(BillStages.INTRODUCED);
  }

  let becameLaw = false;
  let vetoed = false;
  let signed = false;
  let toPresident = false;
  let passedHouse = false;
  let passedSenate = false;
  let outOfCommittee = false;
  let inCommittee = false;

  for (const action of actions) {
    const text = (action.text || "").toLowerCase();
    const type = (action.type || "").toLowerCase();
    const code = action.actionCode || "";

    if (
      text.includes("became public law") ||
      text.includes("became private law") ||
      type === "becamelaw" ||
      code === "36000" ||
      code === "E40000"
    ) {
      becameLaw = true;
      saw("becameLaw", action.actionDate);
    }

    // Veto detection. `E30000` is deliberately NOT used here or for "signed";
    // it is ambiguous between the two. A veto is recognised by its text
    // ("Vetoed by President.", "Pocket Vetoed by President.", "Veto Message
    // received"), its action type, or the unambiguous veto code 31000.
    if (
      text.includes("vetoed") ||
      text.includes("veto message") ||
      text.includes("pocket veto") ||
      type === "vetoed" ||
      type === "veto" ||
      code === "31000"
    ) {
      vetoed = true;
      saw("vetoed", action.actionDate);
    }

    // Signing is recognised ONLY by its unambiguous text (never by E30000).
    if (text.includes("signed by president")) {
      signed = true;
      saw("signed", action.actionDate);
    }

    if (
      text.includes("presented to president") ||
      text.includes("to president") ||
      code === "28000" ||
      code === "E20000"
    ) {
      toPresident = true;
      saw("toPresident", action.actionDate);
    }

    const chamber = passedChamber(action);
    if (chamber === "house") {
      passedHouse = true;
      saw("passedHouse", action.actionDate);
    }
    if (chamber === "senate") {
      passedSenate = true;
      saw("passedSenate", action.actionDate);
    }

    if (leftCommittee(action)) {
      outOfCommittee = true;
      saw("outOfCommittee", action.actionDate);
    }

    if (
      text.includes("referred to") ||
      text.includes("committee") ||
      code === "5000" ||
      code === "14000" ||
      code === "H11100" ||
      code === "S11100"
    ) {
      inCommittee = true;
      saw("inCommittee", action.actionDate);
    }
  }

  if (becameLaw) return stageResult(BillStages.BECAME_LAW, dates.becameLaw);
  if (vetoed) return stageResult(BillStages.VETOED, dates.vetoed);
  if (signed) return stageResult(BillStages.SIGNED_BY_PRESIDENT, dates.signed);
  if (toPresident) return stageResult(BillStages.TO_PRESIDENT, dates.toPresident);
  if (passedHouse && passedSenate) {
    // Both chambers had passed it once the later of the two first passages happened.
    const house = dates.passedHouse;
    const senate = dates.passedSenate;
    return stageResult(
      BillStages.PASSED_BOTH_CHAMBERS,
      house !== null && senate !== null ? (house > senate ? house : senate) : null,
    );
  }
  if (passedHouse || passedSenate) {
    const house = dates.passedHouse;
    const senate = dates.passedSenate;
    const first =
      house === null ? senate : senate === null ? house : house < senate ? house : senate;
    return stageResult(BillStages.PASSED_ONE_CHAMBER, first);
  }
  if (outOfCommittee) return stageResult(BillStages.OUT_OF_COMMITTEE, dates.outOfCommittee);
  if (inCommittee) return stageResult(BillStages.IN_COMMITTEE, dates.inCommittee);
  // Introduction is not an action the flags track; callers fall back to the
  // bill's own introducedDate (see `stageDateFor`).
  return stageResult(BillStages.INTRODUCED);
}

/**
 * The date stored as `bills.stageDate`: the day the bill reached its current
 * stage. A bill still at "Introduced" is dated by its introduction, which is
 * exactly when it got there. Any other stage takes only a dated action: a law
 * whose "Became Public Law" action carries no date is left undated rather than
 * labelled "Became law" with its introduction date. Empty strings are stored as
 * absent, so an undated bill sorts after every dated one in both directions
 * rather than first in one of them.
 */
export function stageDateFor(
  computed: { stage: number; stageDate: string | null },
  introducedDate: string | undefined,
): string | undefined {
  // Never before the bill existed. Committees hold hearings "on the subject
  // prior to introduction" of an appropriations bill, and those actions are
  // filed on the bill: 26 bills were dated into committee months before they
  // were introduced (S. 2431 on 14 May 2025, introduced 24 Jul 2025).
  if (computed.stageDate) {
    return introducedDate && computed.stageDate < introducedDate ? introducedDate : computed.stageDate;
  }
  if (computed.stage === BillStages.INTRODUCED) return introducedDate || undefined;
  return undefined;
}
