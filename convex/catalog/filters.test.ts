/**
 * Filter validation (spec §4.4).
 *
 * The important property: a bad filter produces a DESCRIPTIVE ERROR the model
 * can recover from, never an empty result set. An empty result reads to the
 * model as "none exist", which turns a typo into a confident falsehood.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { validateFilters } from "./filters";

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

it("accepts a valid bills filter", () => {
  const r = validateFilters("bills", { congress: 119, policyArea: "Health" });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.filters, { congress: 119, policyArea: "Health" });
});

it("accepts an empty filter object", () => {
  assert.equal(validateFilters("bills", {}).ok, true);
});

it("rejects an unknown filter and names the valid ones", () => {
  const r = validateFilters("bills", { sponsorAge: 50 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.error.includes("sponsorAge"), "error must name the bad filter");
    assert.ok(r.error.includes("congress"), "error must list valid filters");
  }
});

it("rejects a stage that is not a real stage code", () => {
  const r = validateFilters("bills", { progressStage: 55 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("20"), "error must list the valid stages");
});

it("accepts every real stage code", () => {
  for (const stage of [20, 40, 60, 80, 85, 90, 95, 100]) {
    assert.equal(validateFilters("bills", { progressStage: stage }).ok, true, `stage ${stage}`);
  }
});

it("rejects a wrong-typed value", () => {
  const r = validateFilters("bills", { congress: "119" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.toLowerCase().includes("number"));
});

it("accepts a string array for sponsorFilter", () => {
  const r = validateFilters("bills", { sponsorFilter: ["John Sarbanes"] });
  assert.equal(r.ok, true);
});

it("rejects a bare string for sponsorFilter", () => {
  assert.equal(validateFilters("bills", { sponsorFilter: "John Sarbanes" }).ok, false);
});

it("rejects a chamber that is not house or senate", () => {
  const r = validateFilters("bills", { chamber: "lords" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.includes("house"));
});

it("rejects a non-object", () => {
  assert.equal(validateFilters("bills", "congress=119").ok, false);
  assert.equal(validateFilters("bills", null).ok, false);
});

it("requires billId on bill_actions", () => {
  assert.equal(validateFilters("bill_actions", {}).ok, false);
  assert.equal(validateFilters("bill_actions", { billId: "1234hr119" }).ok, true);
});

console.log(`\ncatalog/filters: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
