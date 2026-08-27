/**
 * Catalog integrity. The catalog is prose that the model depends on, so these
 * tests guard the properties a careless edit would break: an empty field, a
 * duplicated filter name, or an index that has grown past its token budget.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { DATASETS, DATASET_NAMES, datasetIndex, describeDataset } from "./datasets";

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

it("exposes exactly the six datasets in the spec", () => {
  assert.deepEqual([...DATASET_NAMES].sort(), [
    "bill_actions",
    "bill_summaries",
    "bills",
    "sponsors",
    "stats",
    "topics",
  ]);
});

it("gives every dataset a non-empty one-line summary", () => {
  for (const name of DATASET_NAMES) {
    const s = DATASETS[name].summary;
    assert.ok(s.length > 0, `${name} has an empty summary`);
    assert.ok(!s.includes("\n"), `${name} summary must be one line`);
  }
});

it("gives every dataset fields, filters, gotchas and notCovered", () => {
  for (const name of DATASET_NAMES) {
    const d = DATASETS[name];
    assert.ok(d.fields.length > 0, `${name} has no fields`);
    assert.ok(d.gotchas.length > 0, `${name} has no gotchas`);
    assert.ok(d.notCovered.length > 0, `${name} has no notCovered`);
    assert.ok(d.grain.length > 0, `${name} has no grain`);
  }
});

it("never repeats a filter name within a dataset", () => {
  for (const name of DATASET_NAMES) {
    const names = DATASETS[name].filters.map((f) => f.name);
    assert.equal(new Set(names).size, names.length, `${name} has duplicate filters`);
  }
});

it("keeps the prompt index inside its token budget", () => {
  // The index sits in EVERY request, so it is the one part of the catalog with
  // a hard cost. ~4 chars per token; the spec budgets ~400 tokens.
  const index = datasetIndex();
  assert.ok(index.length < 1600, `index is ${index.length} chars, budget is 1600`);
  for (const name of DATASET_NAMES) {
    assert.ok(index.includes(name), `index omits ${name}`);
  }
});

it("describes a dataset with its gotchas included", () => {
  const text = describeDataset("bills");
  assert.ok(text.includes("progressStage"));
  assert.ok(text.toLowerCase().includes("not a percentage"));
  assert.ok(text.toLowerCase().includes("primary sponsor"));
});

console.log(`\ncatalog/datasets: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
