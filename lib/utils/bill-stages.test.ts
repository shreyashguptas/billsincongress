/**
 * Tests for the bill-page stage track.
 *
 * This exists because of a real defect: the old pipeline rendered eight steps
 * with "Vetoed" inline at index 4 and marked every step at or before the bill's
 * current stage complete. A bill that became law therefore displayed a
 * check-marked "Vetoed" step it had never been through — a confident, visible
 * falsehood about legislation on the page a reader trusts most. The track that
 * replaced it (components/brand/status.tsx) fills `getStageStep(stage).step` of
 * `MAIN_PATH_LABELS`; these tests hold both to the path a bill can travel.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import {
  BillStages,
  getStageStep,
  MAIN_PATH_LABELS,
  stageLabel,
  TOTAL_STAGE_STEPS,
} from "./bill-stages";

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

/** The step names a bill at `stage` shows as reached. */
const reached = (stage: number) => MAIN_PATH_LABELS.slice(0, getStageStep(stage).step);

// The defect this file exists for

it("the track never names a Vetoed step", () => {
  assert.equal((MAIN_PATH_LABELS as readonly string[]).includes("Vetoed"), false);
});

it("a bill that became law has reached every step, and only those", () => {
  assert.deepEqual(reached(BillStages.BECAME_LAW), [...MAIN_PATH_LABELS]);
});

// The main path

it("the main path is the seven steps a bill can actually travel", () => {
  assert.equal(MAIN_PATH_LABELS.length, TOTAL_STAGE_STEPS);
  assert.deepEqual(MAIN_PATH_LABELS, [
    "Introduced",
    "Committee",
    "One chamber",
    "Both chambers",
    "To President",
    "Signed",
    "Law",
  ]);
});

it("the track stops at the bill's current stage", () => {
  assert.deepEqual(reached(BillStages.INTRODUCED), ["Introduced"]);
  assert.deepEqual(reached(BillStages.IN_COMMITTEE), ["Introduced", "Committee"]);
  assert.deepEqual(reached(BillStages.PASSED_ONE_CHAMBER), ["Introduced", "Committee", "One chamber"]);
  assert.equal(reached(BillStages.TO_PRESIDENT).length, 5);
  assert.equal(reached(BillStages.SIGNED_BY_PRESIDENT).length, 6);
  assert.equal(reached(BillStages.BECAME_LAW).length, 7);
});

// Vetoed stops at the President

it("a vetoed bill reaches the President and nothing after", () => {
  assert.deepEqual(getStageStep(BillStages.VETOED), { step: 5, total: 7, isVetoed: true });
  for (const unreached of ["Signed", "Law"]) {
    assert.equal((reached(BillStages.VETOED) as string[]).includes(unreached), false, `must not reach ${unreached}`);
  }
  assert.equal(stageLabel(BillStages.VETOED), "Vetoed", "the track says the veto in words");
});

it("no stage reaches past the end of the track", () => {
  for (const stage of Object.values(BillStages)) {
    const { step, total } = getStageStep(stage);
    assert.ok(step >= 1 && step <= total, `stage ${stage} reached step ${step} of ${total}`);
  }
});

it("an unrecognised stage reaches no step at all", () => {
  // A missing progress_stage parses to NaN; a code outside BillStages is just as
  // unproven. Neither may be drawn as "Stage 1 of 7" or fill a segment.
  for (const stage of [NaN, -1, 55]) {
    assert.deepEqual(getStageStep(stage), { step: 0, total: 7, isVetoed: false }, `stage ${stage}`);
    assert.deepEqual(reached(stage), [], `stage ${stage} reached nothing`);
  }
});

// Labels

it("every stage has a sentence-case label", () => {
  for (const stage of Object.values(BillStages)) {
    const label = stageLabel(stage);
    assert.notEqual(label, "Unknown");
    assert.equal(label.slice(1), label.slice(1).replace(/\b(Committee|Chamber|Chambers|Law)\b/g, (w) => w.toLowerCase()), `"${label}" is not sentence case`);
  }
  assert.equal(stageLabel(-1), "Unknown");
});

if (failures.length) {
  console.error(`\nbillStages: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`billStages: all ${passed} tests passed`);
