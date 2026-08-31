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
import { validateFilters, VALID_SORTS, VALID_STAGES } from "./filters";

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

/**
 * The four names are written out as LITERALS here on purpose. Every other sort
 * test loops over VALID_SORTS, so they all pass vacuously if that array is ever
 * emptied — a negative control proved it: with `VALID_SORTS = []` this file
 * still reported 22 passed while `{ sort: "newest_action" }` came back as
 * "sort must be one of ." and sorting was dead. fetch.ts looks its SORT_FIELD
 * map up by these exact strings and falls back to `arbitrary` order on a miss,
 * silently, which is the "named the third-most-recent law as the most recent"
 * failure. The names are a contract, not an implementation detail.
 */
it("offers and accepts each of the four sort names by literal name", () => {
  for (const sort of ["newest_action", "oldest_action", "newest_introduced", "oldest_introduced"]) {
    assert.ok(VALID_SORTS.includes(sort), `VALID_SORTS no longer offers ${sort}`);
    const r = validateFilters("bills", { sort });
    assert.equal(r.ok, true, `sort ${sort} was rejected`);
  }
});

/** Same vacuity guard for the stage codes the reachedStage loop iterates. */
it("offers each of the eight stage codes by literal value", () => {
  for (const stage of [20, 40, 60, 80, 85, 90, 95, 100]) {
    assert.ok(VALID_STAGES.includes(stage), `VALID_STAGES no longer offers ${stage}`);
    assert.equal(validateFilters("bills", { reachedStage: stage }).ok, true, `reachedStage ${stage}`);
  }
});

it("accepts every sort the catalog advertises", () => {
  for (const sort of VALID_SORTS) {
    const r = validateFilters("bills", { congress: 119, sort });
    assert.equal(r.ok, true, `sort ${sort} was rejected`);
    if (r.ok) assert.equal(r.filters.sort, sort);
  }
});

it("rejects an invented sort and names the ones that work", () => {
  // Without a sort the engine reads insertion order, so a rejected sort must
  // come back as a correctable error rather than as unsorted rows.
  for (const bad of ["most_recent", "date", "newest", "asc"]) {
    const r = validateFilters("bills", { sort: bad });
    assert.equal(r.ok, false, `sort '${bad}' should be rejected`);
    if (!r.ok) {
      for (const good of VALID_SORTS) {
        assert.ok(r.error.includes(good), `error for '${bad}' omits ${good}`);
      }
    }
  }
});

it("rejects a sort that is not a string", () => {
  assert.equal(validateFilters("bills", { sort: 1 }).ok, false);
});

it("accepts every real stage code on reachedStage", () => {
  for (const stage of VALID_STAGES) {
    assert.equal(validateFilters("bills", { reachedStage: stage }).ok, true, `stage ${stage}`);
  }
});

it("rejects a reachedStage that is not a stage code and explains 'at least'", () => {
  for (const bad of [0, 55, 101, 50]) {
    const r = validateFilters("bills", { reachedStage: bad });
    assert.equal(r.ok, false, `reachedStage ${bad} should be rejected`);
    if (!r.ok) {
      assert.ok(r.error.includes("100"), "error must list the valid stages");
      assert.ok(
        r.error.toLowerCase().includes("at least"),
        "error must explain reachedStage means 'got at least this far'",
      );
    }
  }
});

it("rejects progressStage and reachedStage together", () => {
  // Asking for both is asking for bills that stopped at 60 and also went past
  // it — an empty answer that reads as 'none exist'.
  const r = validateFilters("bills", { progressStage: 60, reachedStage: 60 });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.error.includes("progressStage") && r.error.includes("reachedStage"));
    assert.ok(
      /not both|one or the other|or reachedstage/i.test(r.error),
      "error must say to use one or the other",
    );
  }
});

it("accepts each stage filter on its own", () => {
  assert.equal(validateFilters("bills", { progressStage: 100 }).ok, true);
  assert.equal(validateFilters("bills", { reachedStage: 100 }).ok, true);
});

it("accepts an ISO date on every date filter", () => {
  for (const key of ["introducedAfter", "introducedBefore", "actionAfter", "actionBefore"]) {
    const r = validateFilters("bills", { [key]: "2026-01-31" });
    assert.equal(r.ok, true, `${key} rejected a valid ISO date`);
    if (r.ok) assert.equal(r.filters[key], "2026-01-31");
  }
});

it("rejects anything that is not an ISO date on a date filter", () => {
  // 'last week' and a bare year are what a model reaches for when it is
  // paraphrasing the reader; both must come back as an instruction, not as
  // zero rows.
  for (const key of ["introducedAfter", "introducedBefore", "actionAfter", "actionBefore"]) {
    for (const bad of ["last week", "2026", "31/01/2026", "2026-1-5", ""]) {
      const r = validateFilters("bills", { [key]: bad });
      assert.equal(r.ok, false, `${key} accepted '${bad}'`);
      if (!r.ok) {
        assert.ok(r.error.includes(key), `error for ${key}='${bad}' does not name the filter`);
        assert.ok(r.error.includes("2026-01-31"), "error must show the shape it wants");
      }
    }
    assert.equal(validateFilters("bills", { [key]: 2026 }).ok, false, `${key} accepted a number`);
  }
});

it("rejects a filter that exists as a FIELD but not as a filter", () => {
  // sponsorParty is a real column on bills, so the model reaches for it; the
  // list of what it may filter by is the only way it recovers.
  const r = validateFilters("bills", { sponsorParty: "D" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.error.includes("sponsorParty"));
    assert.ok(r.error.includes("sponsorState"), "error must list the filters that do exist");
    assert.ok(r.error.includes("describe_dataset"), "error must point at describe_dataset");
  }
});

it("rejects a bills filter passed to a dataset that does not have it", () => {
  const r = validateFilters("topics", { policyArea: "Health" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.ok(r.error.includes("policyArea") && r.error.includes("topics"));
    assert.ok(r.error.includes("congress"), "error must list topics' real filters");
  }
  const sorted = validateFilters("sponsors", { sort: "newest_action" });
  assert.equal(sorted.ok, false, "sort is a bills-only filter");
});

console.log(`\ncatalog/filters: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
