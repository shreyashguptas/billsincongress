/**
 * Terminal-stage semantics (defect D13). The arrays asserted here ARE the fix:
 * the shipped wrong answer ("the Senate passed 194 bills in the 119th") came
 * from reading the stage-60 bucket as if it meant "reached stage 60", so every
 * milestone expansion is spelled out literally rather than computed, and the
 * off-ladder veto code is asserted in both directions.
 *
 * Run with: `pnpm test`, or on its own:
 *   ./node_modules/.bin/tsx convex/catalog/stageSemantics.test.ts
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STAGE_CODES,
  milestoneStages,
  reached,
  stageDescription,
  stageSemanticsNote,
} from "./stageSemantics";
import { VALID_STAGES } from "./filters";

let passed = 0;
/** A data-dependent case could not run; the runner must not read this as a pass. */
let skippedProductionData = false;
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

it("lists the ladder codes in order, matching the filter allowlist", () => {
  assert.deepEqual(STAGE_CODES, [20, 40, 60, 80, 85, 90, 95, 100]);
  // Drift guard: a stage the validator accepts but this module cannot expand
  // would make a reachedStage filter silently match nothing.
  assert.deepEqual(STAGE_CODES, VALID_STAGES);
});

it("expands every milestone to the terminal stages that imply it", () => {
  assert.deepEqual(milestoneStages(20), [20, 40, 60, 80, 85, 90, 95, 100]);
  assert.deepEqual(milestoneStages(40), [40, 60, 80, 85, 90, 95, 100]);
  assert.deepEqual(milestoneStages(60), [60, 80, 85, 90, 95, 100]);
  assert.deepEqual(milestoneStages(80), [80, 85, 90, 95, 100]);
  assert.deepEqual(milestoneStages(90), [90, 95, 100]);
  assert.deepEqual(milestoneStages(95), [95, 100]);
  assert.deepEqual(milestoneStages(100), [100]);
});

it("includes 85 in every milestone up to 'passed both chambers'", () => {
  // A vetoed bill cleared both chambers on its way to the President.
  for (const milestone of [20, 40, 60, 80]) {
    assert.ok(
      milestoneStages(milestone).includes(85),
      `milestoneStages(${milestone}) should include 85`,
    );
  }
});

it("excludes 85 from every milestone beyond 'passed both chambers'", () => {
  // A veto is where the bill stopped: it never advanced to 90, 95 or 100.
  for (const milestone of [90, 95, 100]) {
    assert.ok(
      !milestoneStages(milestone).includes(85),
      `milestoneStages(${milestone}) should not include 85`,
    );
  }
});

it("treats milestone 85 as 'was vetoed', not 'got at least this far'", () => {
  assert.deepEqual(milestoneStages(85), [85]);
});

it("resolves reached() across the ladder", () => {
  assert.equal(reached(100, 60), true);
  assert.equal(reached(60, 100), false);
  assert.equal(reached(85, 80), true);
  assert.equal(reached(85, 90), false);
  // A bill that became law was not vetoed. Numeric comparison would say true.
  assert.equal(reached(100, 85), false);
});

it("does not throw on a stage code that does not exist", () => {
  assert.deepEqual(milestoneStages(999), []);
  assert.equal(reached(55, 60), false);
  assert.equal(reached(100, 55), true); // 55 is not a rung; 100 still outranks it
  assert.ok(stageDescription(55).includes("55"));
});

it("describes stages in mid-sentence prose", () => {
  assert.equal(stageDescription(20), "introduced");
  assert.equal(stageDescription(40), "in committee");
  assert.equal(stageDescription(60), "passed one chamber");
  assert.equal(stageDescription(80), "passed both chambers");
  assert.equal(stageDescription(85), "vetoed");
  assert.equal(stageDescription(100), "became law");
  for (const stage of STAGE_CODES) {
    assert.ok(!stageDescription(stage).startsWith("unknown"), `stage ${stage} undescribed`);
  }
});

it("states the bucket-vs-milestone rule, the veto exception and the fix", () => {
  const note = stageSemanticsNote().toLowerCase();
  assert.ok(note.includes("mutually exclusive"));
  assert.ok(note.includes("not cumulative"));
  assert.ok(note.includes("undercount"));
  assert.ok(note.includes("reachedstage"));
  assert.ok(note.includes("85"));
  assert.ok(note.includes("vetoed"));
  // Stage codes are fine; a bill COUNT baked into the prompt would go stale on
  // the next sync and be read out as fact.
  for (const count of ["194", "255", "104", "45"]) {
    assert.ok(!note.includes(count), `the note hard-codes the count ${count}`);
  }
});

it("tells the model to add the vetoed bills to a president's-desk count", () => {
  // reachedStage 90 deliberately excludes 85, but a veto only happens after
  // presentment, so 90 on its own answers "how many bills reached the
  // President" too low — by exactly the vetoed bills. Without this sentence the
  // module trades the stage-60 undercount for a smaller one of the same shape.
  const note = stageSemanticsNote().toLowerCase();
  assert.ok(note.includes("president's desk"), "the note never mentions the desk question");
  assert.ok(note.includes("plus the bills at stage 85"));
});

// ---------------------------------------------------------------------------
// Against real production rows. The cache is gitignored, so this section skips
// cleanly in CI and on a fresh clone; it is the part that proves the milestone
// expansion matches the actual 119th Congress rather than a tidy fixture.
// Regenerate with: ./node_modules/.bin/tsx scripts/truth/dump.ts
// ---------------------------------------------------------------------------
const CACHE = join(dirname(fileURLToPath(import.meta.url)), "../../.truth-cache");
const BILLS_PATH = join(CACHE, "bills.jsonl");
const ACTIONS_PATH = join(CACHE, "billActions.jsonl");
/** Bill types that originate in the Senate. */
const SENATE_TYPES = ["s", "sjres", "sres", "sconres"];

if (!existsSync(BILLS_PATH)) {
  console.log("catalog/stageSemantics: SKIPPED the production-data test — no .truth-cache/");
  if (process.env.REQUIRE_TRUTH_CACHE === "1") {
    console.error("REQUIRE_TRUTH_CACHE=1 but no .truth-cache/ — refusing to pass without running.");
    process.exit(1);
  }
  skippedProductionData = true;
} else {
  const allBills = readFileSync(BILLS_PATH, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { billId: string; congress: number; billType: string; progressStage: number });
  const senate119 = allBills.filter(
    (b) => b.congress === 119 && SENATE_TYPES.includes(b.billType),
  );

  it("agrees with a hand-written filter over real 119th-Congress Senate bills", () => {
    assert.ok(senate119.length > 1000, `only ${senate119.length} Senate rows loaded`);

    const viaModule = senate119
      .filter((b) => milestoneStages(60).includes(b.progressStage))
      .map((b) => b.billId)
      .sort();
    // Written out by hand, not derived from the module under test.
    const byHand = senate119
      .filter((b) =>
        b.progressStage === 60 ||
        b.progressStage === 80 ||
        b.progressStage === 85 ||
        b.progressStage === 90 ||
        b.progressStage === 95 ||
        b.progressStage === 100,
      )
      .map((b) => b.billId)
      .sort();

    assert.deepEqual(viaModule, byHand);
    assert.ok(viaModule.length > 0, "no Senate bill reached stage 60 — cache looks wrong");
    for (const bill of senate119) {
      assert.equal(
        reached(bill.progressStage, 60),
        byHand.includes(bill.billId),
        `${bill.billId} at stage ${bill.progressStage}`,
      );
    }
  });

  it("shows the stage-60 bucket really does undercount the milestone", () => {
    // This gap IS the shipped defect: the bucket answer was 194 Congress-wide
    // when bills that had passed a chamber and gone further were excluded.
    const bucketOnly = senate119.filter((b) => b.progressStage === 60).length;
    const milestone = senate119.filter((b) => reached(b.progressStage, 60)).length;
    assert.ok(
      milestone > bucketOnly,
      `expected the milestone count to exceed the bucket count, got ${milestone} vs ${bucketOnly}`,
    );
    // Every one of those is a bill that passed a chamber and then went
    // further, which is exactly what the bucket answer dropped.
    const wentFurther = senate119.filter((b) =>
      [80, 85, 90, 95, 100].includes(b.progressStage),
    ).length;
    assert.equal(milestone - bucketOnly, wentFurther);
    const becameLaw = senate119.filter((b) => b.progressStage === 100).length;
    assert.ok(becameLaw > 0, "no Senate bill became law — cache looks wrong");
  });

  it("proves every vetoed bill really was presented to the President", () => {
    // Milestone 90 excludes 85 by design, so reachedStage 90 alone answers
    // "how many bills reached the President's desk" too low. This asserts the
    // fact the note relies on: a veto can only follow presentment, so the
    // shortfall is exactly the vetoed bills and nothing else.
    if (!existsSync(ACTIONS_PATH)) return;
    const vetoed = new Set(
      allBills.filter((b) => b.progressStage === 85).map((b) => b.billId),
    );
    assert.ok(vetoed.size > 0, "no vetoed bills in the cache — cache looks wrong");
    assert.equal(reached(85, 90), false, "milestone 90 is expected to exclude 85");

    // Scan without parsing all 55k action rows: pull billId out of the raw line
    // and only decode the handful that belong to a vetoed bill.
    const presented = new Set<string>();
    for (const line of readFileSync(ACTIONS_PATH, "utf8").split("\n")) {
      const at = line.indexOf('"billId":"');
      if (at < 0) continue;
      const id = line.slice(at + 10, line.indexOf('"', at + 10));
      if (!vetoed.has(id)) continue;
      const text = (JSON.parse(line) as { text?: string }).text ?? "";
      if (text.toLowerCase().includes("presented to president")) presented.add(id);
    }
    assert.deepEqual(
      [...vetoed].filter((id) => !presented.has(id)),
      [],
      "a stage-85 bill with no presentment action would break the desk arithmetic",
    );
  });
}

if (failures.length > 0) {
  console.error(`catalog/stageSemantics — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`catalog/stageSemantics — ${passed} passed`);
// Exit 3 when a data-dependent case could not run, so the runner reports it as
// SKIPPED rather than folding it into "0 failed".
if (skippedProductionData) process.exit(3);
export {};
