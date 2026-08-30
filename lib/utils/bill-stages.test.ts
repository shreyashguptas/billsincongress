/**
 * Tests for the bill-page progress pipeline.
 *
 * This exists because of a real defect: the pipeline rendered eight steps with
 * "Vetoed" inline at index 4 and marked every step at or before the bill's
 * current stage complete. A bill that became law therefore displayed a
 * check-marked "Vetoed" step it had never been through — a confident, visible
 * falsehood about legislation on the page a reader trusts most.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import {
  BillStages,
  getProgressDots,
  getStageStep,
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

const labels = (stage: number) => getProgressDots(stage).map((d) => d.stage);
const completed = (stage: number) =>
  getProgressDots(stage).filter((d) => d.isComplete).map((d) => d.stage);

// The defect this file exists for

it("a bill that became law never shows a completed Vetoed step", () => {
  const dots = getProgressDots(BillStages.BECAME_LAW);
  assert.equal(
    dots.some((d) => d.stage === "Vetoed"),
    false,
    "Vetoed must not appear on the path of a bill that became law",
  );
  assert.deepEqual(
    dots.filter((d) => !d.isComplete),
    [],
    "every step on the main path is complete once a bill is law",
  );
});

it("no non-vetoed stage renders a Vetoed step at all", () => {
  for (const stage of [
    BillStages.INTRODUCED,
    BillStages.IN_COMMITTEE,
    BillStages.PASSED_ONE_CHAMBER,
    BillStages.PASSED_BOTH_CHAMBERS,
    BillStages.TO_PRESIDENT,
    BillStages.SIGNED_BY_PRESIDENT,
    BillStages.BECAME_LAW,
  ]) {
    assert.equal(
      labels(stage).includes("Vetoed"),
      false,
      `stage ${stage} must not include a Vetoed step`,
    );
  }
});

// The main path

it("the main path is the seven steps a bill can actually travel", () => {
  assert.deepEqual(labels(BillStages.INTRODUCED), [
    "Introduced",
    "Committee",
    "One Chamber",
    "Both Chambers",
    "To President",
    "Signed",
    "Law",
  ]);
});

it("completion stops at the bill's current stage", () => {
  assert.deepEqual(completed(BillStages.INTRODUCED), ["Introduced"]);
  assert.deepEqual(completed(BillStages.IN_COMMITTEE), ["Introduced", "Committee"]);
  assert.deepEqual(completed(BillStages.PASSED_ONE_CHAMBER), [
    "Introduced",
    "Committee",
    "One Chamber",
  ]);
  assert.equal(completed(BillStages.TO_PRESIDENT).length, 5);
  assert.equal(completed(BillStages.SIGNED_BY_PRESIDENT).length, 6);
  assert.equal(completed(BillStages.BECAME_LAW).length, 7);
});

// Vetoed gets its own, shorter path

it("a vetoed bill's path ends at the veto", () => {
  const dots = getProgressDots(BillStages.VETOED);
  assert.deepEqual(dots.map((d) => d.stage), [
    "Introduced",
    "Committee",
    "One Chamber",
    "Both Chambers",
    "Vetoed",
  ]);
  assert.equal(
    dots.every((d) => d.isComplete),
    true,
    "a vetoed bill did travel every step it is shown",
  );
  assert.equal(dots[dots.length - 1].isVetoed, true, "the veto is flagged for styling");
  assert.equal(
    dots.some((d) => d.stage === "Law"),
    false,
    "a vetoed bill must never show a Law step",
  );
});

it("a vetoed bill shows no step it did not reach", () => {
  const stages = labels(BillStages.VETOED);
  for (const unreached of ["To President", "Signed", "Law"]) {
    assert.equal(stages.includes(unreached), false, `must not show ${unreached}`);
  }
});

// The progress line derives its length from the dots, so the counts must agree

it("the progress-line fraction can never exceed 1", () => {
  for (const stage of Object.values(BillStages)) {
    const dots = getProgressDots(stage);
    const done = dots.filter((d) => d.isComplete).length;
    const fraction = dots.length > 1 ? (done - 1) / (dots.length - 1) : 0;
    assert.ok(
      fraction >= 0 && fraction <= 1,
      `stage ${stage} produced an out-of-range line fraction ${fraction}`,
    );
  }
});

// An unknown stage must degrade to "nothing proven", not to a wrong story

it("an unrecognised stage shows the main path with nothing completed", () => {
  const dots = getProgressDots(-1);
  assert.equal(dots.length, TOTAL_STAGE_STEPS);
  assert.deepEqual(dots.filter((d) => d.isComplete), []);
});

// getStageStep still treats vetoed as off the main path

it("getStageStep puts a vetoed bill at the presidential step, out of seven", () => {
  assert.deepEqual(getStageStep(BillStages.VETOED), {
    step: 5,
    total: 7,
    isVetoed: true,
  });
  assert.deepEqual(getStageStep(BillStages.BECAME_LAW), {
    step: 7,
    total: 7,
    isVetoed: false,
  });
});

if (failures.length) {
  console.error(`\nbillStages: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`billStages: all ${passed} tests passed`);
