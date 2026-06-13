/**
 * Unit tests for the pure sync-status classifier. Mirrors billStage.test.ts:
 * node:assert, no framework. Run via `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  classifySyncState,
  isIncompleteMask,
  getMissingEndpoints,
  SYNC_TEXT,
  SYNC_COMPLETE,
} from "./syncStatus";

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

it("classifies undefined as legacy", () => {
  assert.equal(classifySyncState(undefined), "legacy");
});

it("classifies the full mask (31) as complete", () => {
  assert.equal(classifySyncState(SYNC_COMPLETE), "complete");
});

it("classifies a mask above complete as complete", () => {
  assert.equal(classifySyncState(63), "complete");
});

it("classifies 0 as partial", () => {
  assert.equal(classifySyncState(0), "partial");
});

it("classifies 30 (one bit short) as partial", () => {
  assert.equal(classifySyncState(SYNC_COMPLETE - 1), "partial");
});

it("isIncompleteMask: undefined + partial are incomplete, complete is not", () => {
  assert.equal(isIncompleteMask(undefined), true);
  assert.equal(isIncompleteMask(0), true);
  assert.equal(isIncompleteMask(SYNC_COMPLETE - 1), true);
  assert.equal(isIncompleteMask(SYNC_COMPLETE), false);
});

it("getMissingEndpoints lists all five for an empty mask", () => {
  assert.deepEqual(
    getMissingEndpoints(0).sort(),
    ["actions", "detail", "subjects", "summaries", "text"].sort(),
  );
});

it("getMissingEndpoints returns nothing for a complete mask", () => {
  assert.deepEqual(getMissingEndpoints(SYNC_COMPLETE), []);
});

it("getMissingEndpoints reports only the one missing bit", () => {
  assert.deepEqual(getMissingEndpoints(SYNC_COMPLETE & ~SYNC_TEXT), ["text"]);
});

if (failures.length > 0) {
  console.error(`\nsyncStatus: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`syncStatus: all ${passed} tests passed`);
