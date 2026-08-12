/**
 * Unit tests for the chamber mapping.
 *
 * The point of these is the partition property: the two aggregate key ranges
 * used for exact chamber counts must between them cover every bill type exactly
 * once. A new bill type that broke the "h"/"s" prefix rule would otherwise be
 * counted in the wrong chamber, or in neither, with no error raised anywhere.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import {
  ALL_BILL_TYPES,
  HOUSE_BILL_TYPES,
  SENATE_BILL_TYPES,
  chamberBounds,
  chamberOf,
  withinBounds,
} from "./chamber";

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

// --- chamberOf ------------------------------------------------------------

for (const billType of HOUSE_BILL_TYPES) {
  it(`maps ${billType} to the House`, () => {
    assert.equal(chamberOf(billType), "house");
  });
}

for (const billType of SENATE_BILL_TYPES) {
  it(`maps ${billType} to the Senate`, () => {
    assert.equal(chamberOf(billType), "senate");
  });
}

it("covers all eight congressional bill types", () => {
  // Guards against a type being added to one list but not the other.
  assert.equal(ALL_BILL_TYPES.length, 8);
  assert.equal(new Set(ALL_BILL_TYPES).size, 8);
});

// --- the partition property ----------------------------------------------

it("house bounds contain exactly the House types", () => {
  const bounds = chamberBounds("house");
  for (const billType of HOUSE_BILL_TYPES) {
    assert.ok(withinBounds(billType, bounds), `${billType} should be in range`);
  }
  for (const billType of SENATE_BILL_TYPES) {
    assert.ok(
      !withinBounds(billType, bounds),
      `${billType} should NOT be in the House range`,
    );
  }
});

it("senate bounds contain exactly the Senate types", () => {
  const bounds = chamberBounds("senate");
  for (const billType of SENATE_BILL_TYPES) {
    assert.ok(withinBounds(billType, bounds), `${billType} should be in range`);
  }
  for (const billType of HOUSE_BILL_TYPES) {
    assert.ok(
      !withinBounds(billType, bounds),
      `${billType} should NOT be in the Senate range`,
    );
  }
});

it("the two ranges partition every bill type exactly once", () => {
  const house = chamberBounds("house");
  const senate = chamberBounds("senate");
  for (const billType of ALL_BILL_TYPES) {
    const memberships = [
      withinBounds(billType, house),
      withinBounds(billType, senate),
    ].filter(Boolean).length;
    assert.equal(
      memberships,
      1,
      `${billType} is in ${memberships} ranges, expected exactly 1`,
    );
  }
});

it("bounds and chamberOf agree for every bill type", () => {
  // The count path uses bounds; the filter path uses chamberOf. If these ever
  // disagreed, a chamber page would show a list and a total that contradict.
  for (const billType of ALL_BILL_TYPES) {
    const byBounds = withinBounds(billType, chamberBounds("house"))
      ? "house"
      : "senate";
    assert.equal(byBounds, chamberOf(billType), `disagreement on ${billType}`);
  }
});

it("excludes neighbouring keys that are not bill types", () => {
  // "i" and "t" are the exclusive upper bounds; nothing at or past them counts.
  const house = chamberBounds("house");
  const senate = chamberBounds("senate");
  assert.ok(!withinBounds("i", house));
  assert.ok(!withinBounds("t", senate));
  assert.ok(!withinBounds("g", house));
  assert.ok(!withinBounds("r", senate));
});

if (failures.length > 0) {
  console.error(`\nchamber: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`chamber: all ${passed} tests passed`);
