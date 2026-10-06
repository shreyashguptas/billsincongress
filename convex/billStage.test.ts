/**
 * Unit tests for the bill-stage calculator. The calculator rewrites every
 * bill's progress stage, so it carries a permanent regression test.
 *
 * Run with: `npm test` (which runs `tsx convex/billStage.test.ts`). Uses
 * node:assert rather than a test framework to avoid adding a dependency — this
 * file is excluded from Convex bundling because its name ends in `.test.ts`.
 */
import assert from "node:assert/strict";
import { calculateBillStage, stageDateFor, BillStages } from "./billStage";

type Action = { text: string; type?: string; actionCode?: string; actionDate?: string };

const a = (text: string, extra: Partial<Action> = {}): Action => ({
  text,
  ...extra,
});

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`,
    );
  }
}

const stageOf = (actions: Action[]) => calculateBillStage(actions).stage;

it("returns Introduced (20) for no actions", () => {
  assert.equal(stageOf([]), BillStages.INTRODUCED);
});

it("returns Introduced (20) for an unrecognised action", () => {
  assert.equal(
    stageOf([a("Sponsor introductory remarks on measure.")]),
    BillStages.INTRODUCED,
  );
});

it("returns In Committee (40) when referred to a committee", () => {
  assert.equal(
    stageOf([
      a("Introduced in House"),
      a("Referred to the Committee on the Judiciary."),
    ]),
    BillStages.IN_COMMITTEE,
  );
});

it("returns Passed One Chamber (60) when only one chamber passed", () => {
  assert.equal(
    stageOf([
      a("Referred to the Committee on Finance."),
      a("Passed House", { type: "PassedHouse" }),
    ]),
    BillStages.PASSED_ONE_CHAMBER,
  );
});

it("returns Passed Both Chambers (80) when both chambers passed but not yet to president", () => {
  assert.equal(
    stageOf([
      a("Passed House", { actionCode: "H32500" }),
      a("Passed Senate", { actionCode: "S32500" }),
    ]),
    BillStages.PASSED_BOTH_CHAMBERS,
  );
});

it("returns To President (90) when presented to the president (not yet signed/vetoed)", () => {
  assert.equal(
    stageOf([
      a("Passed House"),
      a("Passed Senate"),
      a("Presented to President.", { actionCode: "E20000" }),
    ]),
    BillStages.TO_PRESIDENT,
  );
});

it("returns Signed (95) on 'Signed by President' text — even when that action also carries E30000", () => {
  assert.equal(
    stageOf([
      a("Presented to President.", { actionCode: "E20000" }),
      a("Signed by President.", { actionCode: "E30000" }),
    ]),
    BillStages.SIGNED_BY_PRESIDENT,
  );
});

it("returns Became Law (100) on 'Became Public Law'", () => {
  assert.equal(
    stageOf([
      a("Signed by President.", { actionCode: "E30000" }),
      a("Became Public Law No: 118-42.", { actionCode: "E40000" }),
    ]),
    BillStages.BECAME_LAW,
  );
});

// ─── THE BUG: a veto action carries the SAME E30000 code as a signing. ───
it("returns Vetoed (85) for a veto that carries E30000 (the real-world bug)", () => {
  assert.equal(
    stageOf([
      a("Presented to President.", { actionCode: "E20000" }),
      a("Vetoed by President.", { actionCode: "E30000" }),
    ]),
    BillStages.VETOED,
  );
});

it("returns Vetoed (85) regardless of action order (veto appears first)", () => {
  assert.equal(
    stageOf([
      a("Vetoed by President.", { actionCode: "E30000" }),
      a("Referred to the Committee on Armed Services."),
      a("Passed House"),
      a("Passed Senate"),
    ]),
    BillStages.VETOED,
  );
});

it("returns Vetoed (85) for a pocket veto", () => {
  assert.equal(stageOf([a("Pocket Vetoed by President.")]), BillStages.VETOED);
});

it("prefers Vetoed (85) over Signed (95) when both flags are present", () => {
  assert.equal(
    stageOf([a("Signed by President."), a("Vetoed by President.")]),
    BillStages.VETOED,
  );
});

it("prefers Became Law (100) over a veto (override case)", () => {
  assert.equal(
    stageOf([
      a("Vetoed by President."),
      a("Passed House over veto."),
      a("Passed Senate over veto."),
      a("Became Public Law No: 118-31."),
    ]),
    BillStages.BECAME_LAW,
  );
});

// ─── stageDate: the day the bill reached its stage ───────────────────────────

const on = (actionDate: string, text: string, extra: Partial<Action> = {}): Action => ({
  text,
  actionDate,
  ...extra,
});

it("dates a law by the day it became law, not by a later committee action", () => {
  // H.R. 1043 (119th): signed 29 Dec 2025, then a Senate committee filed its
  // report on 11 Feb 2026. Sorting by latest action put it six weeks late.
  const result = calculateBillStage([
    on("2025-02-06", "Referred to the Committee on Natural Resources."),
    on("2025-12-29", "Signed by President."),
    on("2025-12-29", "Became Public Law No: 119-60."),
    on("2026-02-11", "By Senator Lee from Committee on Energy and Natural Resources filed written report."),
  ]);
  assert.equal(result.stage, BillStages.BECAME_LAW);
  assert.equal(result.stageDate, "2025-12-29");
});

it("dates a veto by the veto, not the later message to the other chamber", () => {
  const result = calculateBillStage([
    on("2024-05-01", "Passed House", { type: "PassedHouse" }),
    on("2024-06-10", "Vetoed by President."),
    on("2024-06-12", "Veto message received in House."),
  ]);
  assert.equal(result.stage, BillStages.VETOED);
  assert.equal(result.stageDate, "2024-06-10");
});

it("dates an overridden veto by the day it became law", () => {
  const result = calculateBillStage([
    on("2024-06-10", "Vetoed by President."),
    on("2024-07-01", "Passed House over veto."),
    on("2024-07-02", "Became Public Law No: 118-99."),
  ]);
  assert.equal(result.stage, BillStages.BECAME_LAW);
  assert.equal(result.stageDate, "2024-07-02");
});

it("dates passing one chamber by the first passage", () => {
  const result = calculateBillStage([
    on("2025-03-01", "Referred to the Committee on Finance."),
    on("2025-04-10", "Passed House", { type: "PassedHouse" }),
    on("2025-04-20", "Passed House", { type: "PassedHouse" }),
  ]);
  assert.equal(result.stage, BillStages.PASSED_ONE_CHAMBER);
  assert.equal(result.stageDate, "2025-04-10");
});

it("dates passing both chambers by the later chamber's first passage", () => {
  const result = calculateBillStage([
    on("2025-04-10", "Passed House", { type: "PassedHouse" }),
    on("2025-06-02", "Passed Senate", { type: "PassedSenate" }),
  ]);
  assert.equal(result.stage, BillStages.PASSED_BOTH_CHAMBERS);
  assert.equal(result.stageDate, "2025-06-02");
});

it("dates committee by the first referral, whatever order the actions arrive in", () => {
  const result = calculateBillStage([
    on("2025-05-01", "Committee on the Judiciary. Hearings held."),
    on("2025-01-09", "Referred to the Committee on the Judiciary."),
  ]);
  assert.equal(result.stage, BillStages.IN_COMMITTEE);
  assert.equal(result.stageDate, "2025-01-09");
});

it("ignores actions with no date", () => {
  const result = calculateBillStage([
    on("", "Became Public Law No: 119-1."),
    on("2025-01-29", "Became Public Law No: 119-1."),
  ]);
  assert.equal(result.stageDate, "2025-01-29");
});

it("leaves an introduced bill undated, and stageDateFor falls back to introduction", () => {
  const result = calculateBillStage([on("2025-01-03", "Introduced in House")]);
  assert.equal(result.stage, BillStages.INTRODUCED);
  assert.equal(result.stageDate, null);
  assert.equal(stageDateFor(result, "2025-01-03"), "2025-01-03");
  assert.equal(stageDateFor(calculateBillStage([]), ""), undefined);
});

it("never dates a later stage by the introduction date", () => {
  // The sync stores a missing actionDate as "". A law whose only "Became Public
  // Law" action is undated must not read "Became law · <introduction date>".
  const law = calculateBillStage([
    on("2025-01-09", "Referred to the Committee on the Judiciary."),
    on("", "Became Public Law No: 119-5."),
  ]);
  assert.equal(law.stage, BillStages.BECAME_LAW);
  assert.equal(law.stageDate, null);
  assert.equal(stageDateFor(law, "2025-01-03"), undefined);

  // Passed both chambers, one passage undated: no date, not a guess.
  const both = calculateBillStage([
    on("2025-04-10", "Passed House", { type: "PassedHouse" }),
    on("", "Passed Senate", { type: "PassedSenate" }),
  ]);
  assert.equal(both.stage, BillStages.PASSED_BOTH_CHAMBERS);
  assert.equal(stageDateFor(both, "2025-01-03"), undefined);
});

// ─── Chamber passage as the Library of Congress actually records it ─────────
// Real rows from production. Until 2026-09-30 none of them counted as passage,
// and 3,766 bills that had passed a chamber read "In Committee" or "Introduced".

it("H.R. 10326 (119th) passed the House on 16 Sep 2026; it is not in committee", () => {
  const result = calculateBillStage([
    on("2026-09-10", "Introduced in House", { actionCode: "1000", type: "IntroReferral" }),
    on("2026-09-10", "Referred to the House Committee on the Judiciary.", { actionCode: "H11100", type: "IntroReferral" }),
    on("2026-09-16", "On passage Passed by the Yeas and Nays: 217 - 207 (Roll no. 310). (text: CR H5947)", { actionCode: "H37100", type: "Floor" }),
    on("2026-09-16", "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 217 - 207 (Roll no. 310).", { actionCode: "8000", type: "Floor" }),
    on("2026-09-17", "Received in the Senate and Read twice and referred to the Committee on the Judiciary.", { type: "IntroReferral" }),
  ]);
  assert.equal(result.stage, BillStages.PASSED_ONE_CHAMBER);
  assert.equal(result.stageDate, "2026-09-16");
});

it("recognises House passage by its text when the code is missing", () => {
  assert.equal(
    stageOf([a("Passed/agreed to in House: On motion to suspend the rules and pass the bill Agreed to by voice vote.")]),
    BillStages.PASSED_ONE_CHAMBER,
  );
});

it("H.R. 952 (119th) passed both chambers, dated by the Senate on 22 Sep 2026", () => {
  const result = calculateBillStage([
    on("2025-02-04", "Referred to the House Committee on Natural Resources.", { actionCode: "H11100" }),
    on("2025-05-13", "Passed/agreed to in House: On motion to suspend the rules and pass the bill Agreed to by voice vote. (text: CR H1982)", { actionCode: "8000" }),
    on("2026-07-23", "Committee on Energy and Natural Resources. Reported by Senator Lee without amendment. Without written report.", { actionCode: "14000" }),
    on("2026-09-22", "Passed/agreed to in Senate: Passed Senate without amendment by Unanimous Consent. (consideration: CR S4882-4883)", { actionCode: "17000" }),
  ]);
  assert.equal(result.stage, BillStages.PASSED_BOTH_CHAMBERS);
  assert.equal(result.stageDate, "2026-09-22");
});

it("a Senate resolution agreed to in the Senate has passed its chamber", () => {
  assert.equal(
    stageOf([
      a("Passed/agreed to in Senate: Submitted in the Senate, considered, and agreed to without amendment and with a preamble by Unanimous Consent.", { actionCode: "17000" }),
    ]),
    BillStages.PASSED_ONE_CHAMBER,
  );
});

it("H.R. 5894 (118th): the rule passing the House is not the bill passing it", () => {
  // The House adopted H. Res. 864, the terms of debate, then never passed the bill.
  const result = calculateBillStage([
    on("2023-10-25", "Referred to the House Committee on Appropriations.", { actionCode: "H11100" }),
    on("2023-11-14", "Rule H. Res. 864 passed House.", { actionCode: "H1L220", type: "Floor" }),
    on("2023-11-15", "Considered as unfinished business. (consideration: CR H5869-5880)", { actionCode: "H30000", type: "Floor" }),
  ]);
  assert.equal(result.stage, BillStages.IN_COMMITTEE);
  assert.equal(result.stageDate, "2023-10-25");
});

// --- Out of committee (50) ---------------------------------------------------
//
// S. 2431 (119th), the 2026 Interior appropriations bill: reported by the
// Appropriations Committee and placed on the Senate calendar on 24 Jul 2025,
// and shown as "in committee for 439 days" because the reported codes counted
// as being in committee. 2,145 measures across the three Congresses read that way.

const at = (date: string, text: string, extra: Partial<Action> = {}): Action => ({ text, actionDate: date, ...extra });

it("S. 2431 (119th): reported and calendared in the Senate is out of committee", () => {
  const result = calculateBillStage([
    at("2025-05-14", "Subcommittee on Department of Interior, Environment, and Related Agencies. Hearings held on the subject prior to the subcommittee markup."),
    at("2025-07-24", "Introduced in Senate", { actionCode: "10000" }),
    at("2025-07-24", "Committee on Appropriations. Original measure reported to Senate by Senator Murkowski. With written report No. 119-46.", { actionCode: "14000" }),
    at("2025-07-24", "Placed on Senate Legislative Calendar under General Orders. Calendar No. 124."),
  ]);
  assert.equal(result.stage, BillStages.OUT_OF_COMMITTEE);
  assert.equal(result.stageDate, "2025-07-24");
});

it("a Rule XIV bill, read twice and calendared mid-sentence, is out of committee", () => {
  // Review on #174: the Senate records this as one sentence, and 133 such bills
  // were left at Introduced by a match on the start of the text.
  assert.equal(
    stageOf([
      at("2025-02-03", "Introduced in the Senate. Read the first time. Placed on Senate Legislative Calendar under Read the First Time."),
      at("2025-02-04", "Read the second time. Placed on Senate Legislative Calendar under General Orders. Calendar No. 12."),
    ]),
    BillStages.OUT_OF_COMMITTEE,
  );
});

it("a House bill on the Union Calendar is out of committee", () => {
  assert.equal(
    stageOf([
      at("2025-03-01", "Referred to the House Committee on Veterans' Affairs.", { actionCode: "H11100" }),
      at("2025-11-07", "Reported (Amended) by the Committee on Veterans' Affairs. H. Rept. 119-371.", { actionCode: "5000" }),
      at("2025-11-07", "Placed on the Union Calendar, Calendar No. 323.", { actionCode: "H12410" }),
    ]),
    BillStages.OUT_OF_COMMITTEE,
  );
});

it("a House report that is only Part 1 leaves the bill with its other committees", () => {
  // H.R. 179 (119th): reported by Natural Resources, "Part 1", never calendared.
  assert.equal(
    stageOf([
      at("2025-01-03", "Referred to the Committee on Natural Resources, and in addition to the Committee on Agriculture.", { actionCode: "H11100" }),
      at("2026-01-08", "Reported (Amended) by the Committee on Natural Resources. H. Rept. 119-430, Part I.", { actionCode: "5000" }),
    ]),
    BillStages.IN_COMMITTEE,
  );
});

it("a committee vote to report, or a subcommittee discharged, is still in committee", () => {
  assert.equal(
    stageOf([
      at("2025-06-25", "Referred to the Subcommittee on Energy and Mineral Resources.", { actionCode: "H11000" }),
      at("2025-06-25", "Subcommittee on Energy and Mineral Resources Discharged", { actionCode: "H25000" }),
      at("2025-06-25", "Ordered to be Reported in the Nature of a Substitute by Unanimous Consent.", { actionCode: "H19000" }),
    ]),
    BillStages.IN_COMMITTEE,
  );
});

it("a bill out of committee that then passes a chamber is past one chamber", () => {
  assert.equal(
    stageOf([
      at("2025-11-07", "Placed on the Union Calendar, Calendar No. 323.", { actionCode: "H12410" }),
      at("2026-01-12", "Passed/agreed to in House: On passage Passed by the Yeas and Nays: 300 - 100.", { actionCode: "8000" }),
    ]),
    BillStages.PASSED_ONE_CHAMBER,
  );
});

it("a stage is never dated before the bill was introduced", () => {
  // S. 2431 was dated into committee on 14 May 2025, by a hearing held on its
  // subject before it existed; it was introduced on 24 Jul 2025.
  assert.equal(stageDateFor({ stage: BillStages.IN_COMMITTEE, stageDate: "2025-05-14" }, "2025-07-24"), "2025-07-24");
  assert.equal(stageDateFor({ stage: BillStages.IN_COMMITTEE, stageDate: "2025-08-01" }, "2025-07-24"), "2025-08-01");
});

if (failures.length > 0) {
  console.error(`\nbillStage: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`billStage: all ${passed} tests passed`);
