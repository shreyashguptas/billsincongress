/**
 * Unit tests for the shared option-list matcher.
 *
 * Every searchable filter on /bills routes through `searchOptions`, so the
 * things asserted here are the difference between "type two words in either
 * order and find the sponsor" and the behaviour the seven native `<select>`
 * menus had before, which was none.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { searchOptions } from "./option-search";

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

const STATES = [
  "Alabama",
  "Alaska",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Oklahoma",
];

const keyOf = (s: string) => s;

// --- matching -------------------------------------------------------------

it("returns everything for an empty query", () => {
  const r = searchOptions(STATES, "", { keyOf });
  assert.equal(r.items.length, STATES.length);
  assert.equal(r.total, STATES.length);
  assert.equal(r.truncated, false);
});

it("treats a whitespace-only query as empty", () => {
  const r = searchOptions(STATES, "   \t ", { keyOf });
  assert.equal(r.items.length, STATES.length);
});

it("matches case-insensitively", () => {
  const r = searchOptions(STATES, "MAINE", { keyOf });
  assert.deepEqual(r.items, ["Maine"]);
});

it("matches a substring anywhere, not just a prefix", () => {
  // "as" appears inside Alaska and Massachusetts but starts neither.
  const r = searchOptions(STATES, "as", { keyOf });
  assert.deepEqual([...r.items].sort(), ["Alaska", "Massachusetts"]);
});

it("ANDs multiple tokens, in any order", () => {
  const sponsors = [
    "Maria Salazar · R · FL",
    "John Smith · D · TX",
    "Jane Smith · R · CA",
  ];
  const both = searchOptions(sponsors, "tx smith", { keyOf });
  assert.deepEqual(both.items, ["John Smith · D · TX"]);

  const reversed = searchOptions(sponsors, "smith tx", { keyOf });
  assert.deepEqual(reversed.items, both.items, "token order must not matter");
});

it("returns nothing when one token of several fails to match", () => {
  const r = searchOptions(STATES, "maine alaska", { keyOf });
  assert.equal(r.total, 0);
  assert.deepEqual(r.items, []);
});

// --- ranking --------------------------------------------------------------

it("ranks prefix matches before substring matches", () => {
  // Both Maine and Oklahoma contain "ma"; only Maine starts with it.
  const r = searchOptions(STATES, "ma", { keyOf });
  assert.equal(r.items[0], "Maine", `got ${JSON.stringify(r.items)}`);
  assert.ok(
    r.items.indexOf("Oklahoma") > r.items.indexOf("Massachusetts"),
    "substring match must sort after every prefix match",
  );
});

it("is stable within a rank, preserving the caller's ordering", () => {
  const r = searchOptions(STATES, "ma", { keyOf });
  const prefixes = r.items.filter((s) => s.toLowerCase().startsWith("ma"));
  assert.deepEqual(prefixes, ["Maine", "Maryland", "Massachusetts"]);
});

// --- exclusion ------------------------------------------------------------

it("drops excluded items", () => {
  const r = searchOptions(STATES, "", {
    keyOf,
    exclude: new Set(["Maine", "Alaska"]),
  });
  assert.equal(r.items.includes("Maine"), false);
  assert.equal(r.items.includes("Alaska"), false);
  assert.equal(r.total, STATES.length - 2);
});

it("excludes on idOf, not on the searchable haystack", () => {
  const rows = [
    { name: "Jane Smith", haystack: "Jane Smith R CA" },
    { name: "John Smith", haystack: "John Smith D TX" },
  ];
  const r = searchOptions(rows, "smith", {
    keyOf: (x) => x.haystack,
    idOf: (x) => x.name,
    exclude: new Set(["Jane Smith"]),
  });
  assert.deepEqual(
    r.items.map((x) => x.name),
    ["John Smith"],
  );
});

// --- the cap --------------------------------------------------------------

it("caps items at the limit but reports the true total", () => {
  const many = Array.from({ length: 250 }, (_, i) => `Member ${i}`);
  const r = searchOptions(many, "member", { keyOf, limit: 100 });
  assert.equal(r.items.length, 100);
  assert.equal(r.total, 250, "the UI has to say what it is not showing");
  assert.equal(r.truncated, true);
});

it("does not report truncation when everything fits", () => {
  const r = searchOptions(STATES, "", { keyOf, limit: 100 });
  assert.equal(r.truncated, false);
  assert.equal(r.total, r.items.length);
});

it("defaults the limit to 100", () => {
  const many = Array.from({ length: 120 }, (_, i) => `Member ${i}`);
  const r = searchOptions(many, "", { keyOf });
  assert.equal(r.items.length, 100);
  assert.equal(r.total, 120);
});

if (failures.length > 0) {
  console.error(`\noption-search: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`option-search: all ${passed} tests passed`);
