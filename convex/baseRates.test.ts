/**
 * Unit tests for the committee base-rate math and the shared `passedChamber`
 * predicate. Pure functions, so they carry a permanent regression test.
 *
 * Run with: `pnpm test` (runs `tsx convex/baseRates.test.ts`). Uses node:assert
 * rather than a test framework; excluded from Convex bundling via `.test.ts`.
 */
import assert from "node:assert/strict";
import {
  computeBaseRateBuckets,
  OPEN_BUCKET_END,
  type BaseRateSample,
  type BaseRateBucket,
} from "./baseRates";
import { passedChamber } from "./billStage";

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

const row = (
  buckets: BaseRateBucket[],
  chamber: "house" | "senate",
  start: number,
): BaseRateBucket => {
  const found = buckets.find(
    (b) => b.chamber === chamber && b.bucketStart === start,
  );
  assert.ok(found, `expected a ${chamber} bucket starting at ${start}`);
  return found;
};

// ── passedChamber predicate ────────────────────────────────────────────
it("passedChamber detects House by text / type / code", () => {
  assert.equal(passedChamber({ text: "Passed House by voice vote" }), "house");
  assert.equal(passedChamber({ text: "", type: "PassedHouse" }), "house");
  assert.equal(passedChamber({ text: "", actionCode: "H32500" }), "house");
});

it("passedChamber detects Senate by text / type / code", () => {
  assert.equal(passedChamber({ text: "Passed Senate with amendments" }), "senate");
  assert.equal(passedChamber({ text: "", type: "PassedSenate" }), "senate");
  assert.equal(passedChamber({ text: "", actionCode: "S32500" }), "senate");
});

it("passedChamber returns null for committee / referral actions", () => {
  assert.equal(passedChamber({ text: "Referred to the Committee on Finance." }), null);
  assert.equal(passedChamber({ text: "Introduced in House" }), null);
  assert.equal(passedChamber({ text: "" }), null);
});

// ── computeBaseRateBuckets: the worked example ─────────────────────────
// 5 House bills die in committee; 5 advance on days 30/60/120/200/400.
// Expected staircase: 50% → 38% → 29% → 17%.
const workedExample: BaseRateSample[] = [
  ...Array.from({ length: 5 }, () => ({
    chamber: "house" as const,
    advanced: false,
    firstAdvanceDays: null,
  })),
  { chamber: "house", advanced: true, firstAdvanceDays: 30 },
  { chamber: "house", advanced: true, firstAdvanceDays: 60 },
  { chamber: "house", advanced: true, firstAdvanceDays: 120 },
  { chamber: "house", advanced: true, firstAdvanceDays: 200 },
  { chamber: "house", advanced: true, firstAdvanceDays: 400 },
];

it("computes the 50/38/29/17 staircase for the worked example", () => {
  const b = computeBaseRateBuckets(workedExample);

  const b0 = row(b, "house", 0);
  assert.equal(b0.totalCount, 10);
  assert.equal(b0.advancedCount, 5);
  assert.equal(b0.ratePercent, 50);

  const b90 = row(b, "house", 90);
  assert.equal(b90.totalCount, 8); // 5 never + (120,200,400)
  assert.equal(b90.advancedCount, 3);
  assert.equal(b90.ratePercent, 38); // round(37.5)

  const b180 = row(b, "house", 180);
  assert.equal(b180.totalCount, 7); // 5 never + (200,400)
  assert.equal(b180.advancedCount, 2);
  assert.equal(b180.ratePercent, 29); // round(28.57)

  const b365 = row(b, "house", 365);
  assert.equal(b365.totalCount, 6); // 5 never + (400)
  assert.equal(b365.advancedCount, 1);
  assert.equal(b365.ratePercent, 17); // round(16.67)
  assert.equal(b365.bucketEnd, OPEN_BUCKET_END);
});

it("keeps House and Senate samples separate", () => {
  const samples: BaseRateSample[] = [
    ...workedExample,
    { chamber: "senate", advanced: false, firstAdvanceDays: null },
    { chamber: "senate", advanced: false, firstAdvanceDays: null },
    { chamber: "senate", advanced: true, firstAdvanceDays: 10 },
  ];
  const b = computeBaseRateBuckets(samples);
  // Senate at day 0: 3 in committee, 1 advanced → 33%.
  const s0 = row(b, "senate", 0);
  assert.equal(s0.totalCount, 3);
  assert.equal(s0.advancedCount, 1);
  assert.equal(s0.ratePercent, 33);
  // House unaffected.
  assert.equal(row(b, "house", 0).totalCount, 10);
});

it("returns zeroed buckets (no divide-by-zero) for empty input", () => {
  const b = computeBaseRateBuckets([]);
  assert.equal(b.length, 8); // 4 buckets × 2 chambers
  for (const bucket of b) {
    assert.equal(bucket.totalCount, 0);
    assert.equal(bucket.advancedCount, 0);
    assert.equal(bucket.ratePercent, 0);
  }
});

if (failures.length > 0) {
  console.error(`\nbaseRates: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`baseRates: all ${passed} tests passed`);
