/**
 * Catalog integrity. The catalog is prose that the model depends on, so these
 * tests guard the properties a careless edit would break: an empty field, a
 * duplicated filter name, or an index that has grown past its token budget.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { DATASETS, DATASET_NAMES, datasetIndex, describeDataset } from "./datasets";
import { VALID_SORTS, VALID_STAGES } from "./filters";
import type { DatasetName } from "./types";

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

/**
 * Everything below guards the catalog prose the 2026-08-30 accuracy audit had
 * to invent. Each block is a sentence the model must be able to read; if a
 * later edit drops it, the wrong answer it prevents comes back. Phrases are
 * matched loosely (a keyword, not a sentence) so the prose can still be
 * rewritten — but the FACT has to survive.
 */

/** One dataset's gotchas, lowercased, for phrase checks. */
function gotchasOf(name: DatasetName): string[] {
  return DATASETS[name].gotchas.map((g) => g.toLowerCase());
}

function gotchaSaying(name: DatasetName, ...needles: string[]): string {
  const hit = gotchasOf(name).find((g) => needles.every((n) => g.includes(n)));
  assert.ok(hit, `${name} has no gotcha mentioning ${needles.join(" + ")}`);
  return hit;
}

it("teaches the completeness contract in the bills gotchas", () => {
  // The audit's three worst answers were all set-level claims read off a page.
  // The model only stops making them if the catalog says what `complete` means.
  const whenComplete = gotchaSaying("bills", "complete: true");
  assert.ok(whenComplete.includes("total"), "complete: true must be tied to an exact total");

  const whenNot = gotchaSaying("bills", "complete: false");
  assert.ok(/no total|there is no total/.test(whenNot), "complete: false must say there is no total");
  assert.ok(whenNot.includes("none"), "must forbid saying 'none' on an incomplete result");
  assert.ok(
    /absence|not evidence/.test(whenNot),
    "must say an empty incomplete result is not evidence of absence",
  );
});

it("warns in the bills gotchas that row order means nothing by default", () => {
  // "Third-most-recent law named as the most recent" — the true answer was not
  // even on the page the model was reasoning over.
  const g = gotchaSaying("bills", "order", "arbitrary");
  assert.ok(g.includes("sort"), "must tell the model to pass a sort for 'most recent'");
  assert.ok(/first row|first or last/.test(g), "must say the first row is not the newest");
});

it("separates progressStage (terminal) from reachedStage (milestone)", () => {
  const g = gotchaSaying("bills", "progressstage", "reachedstage");
  assert.ok(/stopped|ended up|terminal/.test(g), "progressStage must be described as terminal");
  assert.ok(g.includes("milestone"), "reachedStage must be described as the milestone filter");
  assert.ok(/not cumulative|omits/.test(g), "must say counting one bucket omits what went further");
});

it("declares the filters the accuracy fixes added to bills", () => {
  const declared = new Map(DATASETS.bills.filters.map((f) => [f.name, f]));
  for (const name of [
    "reachedStage",
    "sort",
    "introducedAfter",
    "introducedBefore",
    "actionAfter",
    "actionBefore",
  ]) {
    const spec = declared.get(name);
    assert.ok(spec, `bills does not declare the ${name} filter`);
    assert.ok((spec.allowed ?? "").length > 0, `${name} has no 'allowed' prose`);
    assert.ok((spec.example ?? "").length > 0, `${name} has no example`);
  }
});

it("documents on the sort filter every value the validator accepts", () => {
  // A sort the catalog omits is a sort the model never tries; a sort the
  // catalog invents is a rejected tool call. Both lists must match.
  const spec = DATASETS.bills.filters.find((f) => f.name === "sort");
  assert.ok(spec, "bills must declare sort");
  // Guard against a vacuous pass: an empty VALID_SORTS kills sorting outright
  // (every sort value gets rejected) while a loop over it asserts nothing.
  assert.ok(VALID_SORTS.length >= 4, "VALID_SORTS has lost values — sorting is broken");
  for (const value of VALID_SORTS) {
    assert.ok((spec.allowed ?? "").includes(value), `sort docs omit ${value}`);
  }
});

it("documents on the progressStage filter every stage code the validator accepts", () => {
  const spec = DATASETS.bills.filters.find((f) => f.name === "progressStage");
  assert.ok(spec, "bills must declare progressStage");
  assert.ok(VALID_STAGES.length >= 8, "VALID_STAGES has lost codes — stage filtering is broken");
  for (const stage of VALID_STAGES) {
    assert.ok((spec.allowed ?? "").includes(String(stage)), `progressStage docs omit ${stage}`);
  }
});

it("shows a worked example that sorts, and one that counts with limit 0", () => {
  const examples = DATASETS.bills.examples.map((e) => e.toLowerCase());
  assert.ok(
    examples.some((e) => e.includes('"sort"')),
    "bills needs an example passing sort — 'most recent' questions are unanswerable without it",
  );
  assert.ok(
    examples.some((e) => e.includes("limit 0") || e.includes('"limit": 0')),
    "bills needs an example of the count-only read",
  );
});

it("tells topics that its counts cannot answer 'how many became law'", () => {
  const g = gotchaSaying("topics", "became law");
  assert.ok(/stage-blind|stage blind|any stage/.test(g), "topics counts must be called stage-blind");
  assert.ok(/cannot|can not|not tell/.test(g), "must say plainly that they cannot answer it");
});

it("warns on stats that a chamber row is chamber-only and counts measures", () => {
  const scoped = gotchaSaying("stats", "chamber row");
  assert.ok(/only/.test(scoped), "a chamber row's figures must be described as chamber-only");

  // 'How many House bills became law' was answered 104 (both chambers); it is 64.
  const measures = gotchaSaying("stats", "resolution");
  assert.ok(/not bills/.test(measures), "stats totals must be called measures, not bills");
  const total = DATASETS.stats.fields.find((f) => f.name === "totalMeasures");
  assert.ok(total && /measure/i.test(total.meaning), "totalMeasures must say it counts measures");
});

it("tells sponsors to check completeness before any 'most' or 'fewest' claim", () => {
  // 29 of California's 54 members were read and the answer named the wrong one.
  const g = gotchaSaying("sponsors", "complete");
  assert.ok(/most/.test(g) && /fewest/.test(g), "must name both superlative directions");
});

it("puts the new filters and the completeness rule into describe_dataset output", () => {
  // describeDataset is what the model actually reads; a gotcha it does not
  // render is a gotcha that does not exist.
  const text = describeDataset("bills");
  for (const needle of ["reachedStage", "sort", "actionAfter", "complete", "order", "limit 0"]) {
    assert.ok(text.includes(needle), `describeDataset('bills') omits ${needle}`);
  }
});

it("tells the model where to look up ONE member's bill count", () => {
  // Asked how many bills Monica De La Cruz introduced, the assistant tried to
  // filter `sponsors` by name, was refused, and told the reader it could not
  // find out. The refusal was about its own call, not about our holdings.
  const g = gotchaSaying("sponsors", "sponsorfilter");
  assert.ok(/bills/.test(g), "must name the dataset that does support a name lookup");
});

it("tells the model to group instead of looping a fetch per category", () => {
  const g = gotchaSaying("bills", "groupby");
  assert.ok(/each|breakdown/i.test(g), "must name the question shape groupBy answers");
});

console.log(`\ncatalog/datasets: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
