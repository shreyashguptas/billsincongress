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

if (failures.length > 0) {
  console.error(`\nbillStage: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`billStage: all ${passed} tests passed`);
