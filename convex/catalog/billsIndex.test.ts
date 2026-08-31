/**
 * Index precedence. Every case here is a question a reader actually asked and
 * got a wrong answer to, so a reordering that looks harmless fails loudly.
 * Filter values are real: "1hr119" is the reconciliation act, Monica De La Cruz
 * (TX) is a sitting member whose two-word surname broke sponsor lookups, and
 * 11 Texas bills reached stage 100 in the 119th.
 *
 * Run with: `./node_modules/.bin/tsx convex/catalog/billsIndex.test.ts`.
 */
import assert from "node:assert/strict";
import { chooseBillsIndex, countInMemoryFilters } from "./billsIndex";
import type { BillsBranch } from "./billsIndex";

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

/** Asserts the branch AND what it enforces — the branch alone hides the risk. */
function expectPlan(
  filters: Record<string, unknown>,
  branch: BillsBranch,
  indexName: string,
  indexed: string[],
) {
  const plan = chooseBillsIndex(filters);
  assert.equal(plan.branch, branch);
  assert.equal(plan.indexName, indexName);
  assert.deepEqual([...plan.indexed].sort(), [...indexed].sort());
}

it("1. an exact billId beats every other filter", () => {
  expectPlan(
    { billId: "1hr119", congress: 119, policyArea: "Economics and Public Finance" },
    "billId",
    "by_billId",
    ["billId"],
  );
});

it("2. a non-empty titleFilter takes the search index", () => {
  expectPlan({ congress: 119, titleFilter: "Duty Drawback" }, "titleSearch", "search_title", [
    "titleFilter",
    "congress",
    "billType",
    "progressStage",
    "sponsorState",
  ]);
});

it("3. billNumber beats billType — H.R. 1 is the oldest H.R., not the newest", () => {
  expectPlan({ congress: 119, billType: "hr", billNumber: "1" }, "billNumber", "by_congress_and_bill_number", [
    "congress",
    "billNumber",
  ]);
});

it("4. policyArea + progressStage beats policyArea alone", () => {
  expectPlan(
    { congress: 119, policyArea: "Armed Forces and National Security", progressStage: 100 },
    "policyAreaAndStage",
    "by_congress_policy_area_and_stage",
    ["congress", "policyArea", "progressStage"],
  );
});

it("5. policyArea alone takes the topic index", () => {
  expectPlan({ congress: 119, policyArea: "Health" }, "policyArea", "by_congress_and_policy_area", [
    "congress",
    "policyArea",
  ]);
});

it("6. sponsorState + progressStage beats sponsorState alone", () => {
  expectPlan(
    { congress: 119, sponsorState: "TX", progressStage: 100 },
    "sponsorStateAndStage",
    "by_congress_state_and_stage",
    ["congress", "sponsorState", "progressStage"],
  );
});

it("7. a sponsor name list takes the surname index", () => {
  expectPlan(
    { congress: 119, sponsorFilter: ["Monica De La Cruz"] },
    "sponsorNames",
    "by_congress_and_sponsor_last",
    ["congress"],
  );
});

it("8. sponsorState alone takes the state index", () => {
  expectPlan({ congress: 119, sponsorState: "TX" }, "sponsorState", "by_congress_and_sponsor_state", [
    "congress",
    "sponsorState",
  ]);
});

it("9. progressStage alone takes the stage index", () => {
  expectPlan({ congress: 118, progressStage: 100 }, "progressStage", "by_congress_and_progress_stage", [
    "congress",
    "progressStage",
  ]);
});

it("10. billType alone takes the type index", () => {
  expectPlan({ congress: 119, billType: "s" }, "billType", "by_congress_and_type", [
    "congress",
    "billType",
  ]);
});

it("11. congress alone is the fallback", () => {
  expectPlan({ congress: 117 }, "congress", "by_congress", ["congress"]);
});

it("falls back to congress when no filters are given at all", () => {
  expectPlan({}, "congress", "by_congress", ["congress"]);
});

it("sponsorState + stage is chosen even when a sponsor name list is present", () => {
  // The pair is more selective than the surname index, which pins neither.
  expectPlan(
    { congress: 119, sponsorState: "TX", progressStage: 100, sponsorFilter: ["Monica De La Cruz"] },
    "sponsorStateAndStage",
    "by_congress_state_and_stage",
    ["congress", "sponsorState", "progressStage"],
  );
});

it("an empty titleFilter falls through instead of searching for nothing", () => {
  expectPlan({ congress: 119, titleFilter: "   ", policyArea: "Health" }, "policyArea", "by_congress_and_policy_area", [
    "congress",
    "policyArea",
  ]);
});

it("an empty sponsorFilter array falls through to the next index", () => {
  expectPlan({ congress: 119, sponsorFilter: [], sponsorState: "TX" }, "sponsorState", "by_congress_and_sponsor_state", [
    "congress",
    "sponsorState",
  ]);
});

it("the topic + stage pair leaves nothing to filter in memory", () => {
  const filters = { congress: 119, policyArea: "Health", progressStage: 100 };
  assert.equal(countInMemoryFilters(filters, chooseBillsIndex(filters)), 0);
});

it("the state + stage pair leaves nothing to filter in memory", () => {
  const filters = { congress: 119, sponsorState: "TX", progressStage: 100 };
  assert.equal(countInMemoryFilters(filters, chooseBillsIndex(filters)), 0);
});

it("chamber is not indexed, so a topic + chamber query filters one thing in memory", () => {
  const filters = { congress: 119, policyArea: "Health", chamber: "house" };
  const plan = chooseBillsIndex(filters);
  assert.equal(plan.branch, "policyArea");
  assert.equal(countInMemoryFilters(filters, plan), 1);
});

it("counts the full sponsor name as in-memory — the index holds surnames only", () => {
  const filters = { congress: 119, sponsorFilter: ["Monica De La Cruz"] };
  assert.equal(countInMemoryFilters(filters, chooseBillsIndex(filters)), 1);
});

it("counts congress as in-memory on the billId branch, which is not congress-scoped", () => {
  const filters = { billId: "1hr119", congress: 119 };
  assert.equal(countInMemoryFilters(filters, chooseBillsIndex(filters)), 1);
});

it("ignores keys that are not row filters", () => {
  const filters = { congress: 119, policyArea: "Health", limit: 50, sort: "newest" };
  assert.equal(countInMemoryFilters(filters, chooseBillsIndex(filters)), 0);
});

it("ignores row filters explicitly set to undefined or null", () => {
  const filters = { congress: 119, policyArea: "Health", chamber: undefined, billType: null };
  assert.equal(countInMemoryFilters(filters, chooseBillsIndex(filters)), 0);
});

it("counts every unenforced filter on the bare congress scan", () => {
  // The shape that made 37,000 committee bills look like the whole story:
  // nothing but the Congress is pinned, so both extra filters run over 200 rows.
  const filters = { congress: 118, chamber: "senate" };
  const plan = chooseBillsIndex(filters);
  assert.equal(plan.branch, "congress");
  assert.equal(countInMemoryFilters(filters, plan), 1);
});

it("hands back a fresh indexed array so a caller cannot rewrite the rule table", () => {
  const first = chooseBillsIndex({ congress: 119, policyArea: "Health" });
  first.indexed.push("chamber");
  const second = chooseBillsIndex({ congress: 119, policyArea: "Health" });
  assert.deepEqual([...second.indexed].sort(), ["congress", "policyArea"]);
});

if (failures.length > 0) {
  console.error(`catalog/billsIndex — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`catalog/billsIndex — ${passed} passed`);

export {};
