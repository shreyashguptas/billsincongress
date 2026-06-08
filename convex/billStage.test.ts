/**
 * Unit tests for the bill-stage calculator. The calculator rewrites every
 * bill's progress stage, so it carries a permanent regression test.
 *
 * Run with: `npm test` (which runs `tsx convex/billStage.test.ts`). Uses
 * node:assert rather than a test framework to avoid adding a dependency — this
 * file is excluded from Convex bundling because its name ends in `.test.ts`.
 */
import assert from "node:assert/strict";
import { calculateBillStage, BillStages } from "./billStage";

type Action = { text: string; type?: string; actionCode?: string };

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

if (failures.length > 0) {
  console.error(`\nbillStage: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`billStage: all ${passed} tests passed`);
