/**
 * The completeness contract.
 *
 * These tests exist to keep one promise: a result that did not read its whole
 * set must never carry a number the model can reach for. Every accuracy defect
 * in the 2026-08-30 audit was a set-level claim made from a page, and the single
 * change that makes those impossible is the absence of `total` on an incomplete
 * result — not a warning beside it, its absence.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  completeReport,
  payloadFor,
  reportFor,
  workLogLabel,
  type CompletenessReport,
} from "./completeness";

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

const parse = (rows: unknown[], report: CompletenessReport) => JSON.parse(payloadFor(rows, report));

it("a window that did not fill is complete and carries an exact total", () => {
  const r = reportFor({
    set: "every Health measure that became law",
    windowFilled: false,
    filteredInMemory: true,
    matchedCount: 7,
    shown: 7,
    order: "arbitrary",
  });
  assert.equal(r.complete, true);
  assert.equal(r.total, 7);
});

it("an uncapped read matching nothing is an exact zero, which IS an answer", () => {
  const r = reportFor({
    set: "every measure from Wyoming that became law",
    windowFilled: false,
    filteredInMemory: true,
    matchedCount: 0,
    shown: 0,
    order: "arbitrary",
  });
  assert.equal(r.complete, true);
  assert.equal(r.total, 0, "a complete zero is real and the model may state it");
});

it("a filled window carries NO total, whatever it matched", () => {
  for (const matchedCount of [0, 198, 1000]) {
    const r = reportFor({
      set: "every Health measure in committee",
      windowFilled: true,
      filteredInMemory: true,
      matchedCount,
      shown: 20,
      order: "arbitrary",
    });
    assert.equal(r.complete, false, `matched ${matchedCount}`);
    assert.equal(r.total, undefined, `matched ${matchedCount}: a total leaked out`);
  }
});

it("the incomplete note forbids the three sentences that shipped wrong answers", () => {
  const r = reportFor({
    set: "s",
    windowFilled: true,
    filteredInMemory: true,
    matchedCount: 0,
    shown: 0,
    order: "arbitrary",
  });
  const note = String(r.note);
  assert.match(note, /NOT evidence that few or none exist/i, "an empty sample must not read as 'none'");
  assert.match(note, /do NOT state a number/i);
  assert.match(note, /do NOT say 'none'/i);
  assert.match(note, /we have no data on that/i, "the exact sentence that shipped about Texas");
  assert.match(note, /largest, smallest, newest, oldest/i);
});

it("names the unindexed-filter case, because that is when a zero is meaningless", () => {
  const unindexed = reportFor({
    set: "s",
    windowFilled: true,
    filteredInMemory: true,
    matchedCount: 0,
    shown: 0,
    order: "arbitrary",
  });
  const indexed = reportFor({
    set: "s",
    windowFilled: true,
    filteredInMemory: false,
    matchedCount: 1000,
    shown: 20,
    order: "arbitrary",
  });
  assert.match(String(unindexed.note), /no index/i);
  assert.ok(!/no index/i.test(String(indexed.note)));
});

it("the payload omits `total` entirely rather than sending zero or null", () => {
  const payload = parse(
    [],
    reportFor({
      set: "s",
      windowFilled: true,
      filteredInMemory: true,
      matchedCount: 0,
      shown: 0,
      order: "arbitrary",
    }),
  );
  assert.equal("total" in payload, false, "a key present with any value is a number to reach for");
  assert.equal(payload.complete, false);
  assert.equal(typeof payload.note, "string");
});

it("a complete payload carries the total and says the order means nothing", () => {
  const payload = parse([{ a: 1 }], completeReport({ set: "s", total: 3, shown: 1, order: "arbitrary" }));
  assert.equal(payload.total, 3);
  assert.equal(payload.order, "arbitrary");
  assert.match(payload.order_meaning, /NOT SORTED/);
  assert.match(payload.order_meaning, /never take the first or last row/i);
});

it("a real sort is described as one", () => {
  const payload = parse([], completeReport({ set: "s", total: 3, shown: 0, order: "newest_action_first" }));
  assert.match(payload.order_meaning, /newest first/i);
  assert.ok(!/NOT SORTED/.test(payload.order_meaning));
});

it("warns when the rows are a page of a complete set", () => {
  // California: 54 members, 50 shown. The total is exact and quotable, but the
  // minimum is not on the page — reading the last row as "the fewest" is the
  // error that named the wrong member.
  const payload = parse(
    new Array(50).fill({}),
    completeReport({ set: "s", total: 54, shown: 50, order: "most_bills_first" }),
  );
  assert.match(payload.rows_are_a_sample_of_a_known_total, /50 of 54/);
  assert.match(payload.rows_are_a_sample_of_a_known_total, /do not rank or compare/i);
});

it("does not warn when the page IS the whole set", () => {
  const payload = parse([{}, {}], completeReport({ set: "s", total: 2, shown: 2, order: "arbitrary" }));
  assert.equal(payload.rows_are_a_sample_of_a_known_total, undefined);
});

it("the reader-facing label never shows a number it cannot defend", () => {
  assert.equal(workLogLabel(completeReport({ set: "s", total: 104, shown: 20, order: "arbitrary" })), "104 matches");
  assert.equal(workLogLabel(completeReport({ set: "s", total: 1, shown: 1, order: "arbitrary" })), "1 match");
  assert.equal(
    workLogLabel(
      reportFor({ set: "s", windowFilled: true, filteredInMemory: true, matchedCount: 29, shown: 20, order: "arbitrary" }),
    ),
    "partial results — no count available",
    "the reader was shown '29 matches' for a search that had seen a fraction of the set",
  );
});

it("every payload states the set it drew from", () => {
  const payload = parse([], completeReport({ set: "every Texas measure that became law", total: 11, shown: 0, order: "arbitrary" }));
  assert.equal(payload.set, "every Texas measure that became law");
});

if (failures.length > 0) {
  console.error(`completeness.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`completeness.test.ts — ${passed} passed`);
export {};
