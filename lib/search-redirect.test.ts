/**
 * Unit tests for where `/search` sends a reader.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { searchRedirectPath } from "./search-redirect";
import { MAX_SEARCH_TEXT_LENGTH } from "./bill-query";

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

const go = (qs: string) => searchRedirectPath(new URLSearchParams(qs));

it("sends the words under q to the bills title search", () => {
  assert.equal(go("q=education"), "/bills?title=education");
  assert.equal(go("q=school+lunch"), "/bills?title=school+lunch");
});

it("accepts query and title too, preferring q", () => {
  assert.equal(go("query=veterans"), "/bills?title=veterans");
  assert.equal(go("title=veterans"), "/bills?title=veterans");
  assert.equal(go("title=b&q=a"), "/bills?title=a");
});

it("goes to the plain list when there are no words", () => {
  assert.equal(go(""), "/bills");
  assert.equal(go("q="), "/bills");
  assert.equal(go("q=%20%20"), "/bills");
  assert.equal(go("page=2"), "/bills");
});

it("keeps characters that mean something in a URL inside the title", () => {
  assert.equal(
    new URLSearchParams(go("q=" + encodeURIComponent("R&D tax=credit")).split("?")[1]).get("title"),
    "R&D tax=credit",
  );
});

it("clamps an over-long query the way the bills page does", () => {
  const long = "a".repeat(MAX_SEARCH_TEXT_LENGTH + 50);
  const title = new URLSearchParams(go("q=" + long).split("?")[1]).get("title")!;
  assert.equal(title.length, MAX_SEARCH_TEXT_LENGTH);
});

if (failures.length > 0) {
  console.error(`\nsearch-redirect: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`search-redirect: all ${passed} tests passed`);
