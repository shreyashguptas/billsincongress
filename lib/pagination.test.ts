/**
 * Tests for the pagination window.
 *
 * The load-bearing property is not how pretty the bar looks — it is that no
 * page becomes unreachable. Page 1, the last page and the current page are
 * always present, and the sequence never skips without saying so.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { GAP, lastPageFor, pagesForCount, paginationWindow, type PaginationSlot } from "./pagination";

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

const numbers = (slots: PaginationSlot[]) => slots.filter((s): s is number => s !== GAP);

// Small sets stay whole

it("lists every page when there are few, as the hub pages already did", () => {
  assert.deepEqual(paginationWindow(1, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(paginationWindow(5, 3), [1, 2, 3]);
  assert.deepEqual(paginationWindow(1, 1), [1]);
});

it("returns nothing when there are no pages", () => {
  assert.deepEqual(paginationWindow(1, 0), []);
  assert.deepEqual(paginationWindow(1, -3), []);
});

// Large sets collapse, without losing the anchors

it("collapses the middle of a long set", () => {
  assert.deepEqual(paginationWindow(25, 51), [1, GAP, 24, 25, 26, GAP, 51]);
});

it("keeps first, last and current on every page of a long set", () => {
  const lastPage = 51;
  for (let page = 1; page <= lastPage; page++) {
    const slots = paginationWindow(page, lastPage);
    const ns = numbers(slots);
    assert.ok(ns.includes(1), `page ${page} lost page 1`);
    assert.ok(ns.includes(lastPage), `page ${page} lost the last page`);
    assert.ok(ns.includes(page), `page ${page} lost itself`);
  }
});

it("offers a step in both directions, so the chain is walkable", () => {
  const lastPage = 51;
  for (let page = 1; page <= lastPage; page++) {
    const ns = numbers(paginationWindow(page, lastPage));
    if (page > 1) assert.ok(ns.includes(page - 1), `page ${page} cannot step back`);
    if (page < lastPage) assert.ok(ns.includes(page + 1), `page ${page} cannot step on`);
  }
});

it("never repeats a page and never goes backwards", () => {
  for (const [page, lastPage] of [[1, 51], [2, 51], [25, 51], [50, 51], [51, 51]]) {
    const ns = numbers(paginationWindow(page, lastPage));
    assert.deepEqual(ns, [...new Set(ns)], `page ${page} repeated a number`);
    assert.deepEqual(ns, [...ns].sort((a, b) => a - b), `page ${page} was out of order`);
  }
});

it("writes out a single skipped page instead of hiding it behind an ellipsis", () => {
  // Ends of a long set: the gap between 1 and the neighbourhood is exactly one.
  assert.deepEqual(paginationWindow(3, 51), [1, 2, 3, 4, GAP, 51]);
  assert.deepEqual(paginationWindow(49, 51), [1, GAP, 48, 49, 50, 51]);
});

it("clamps a page outside the range rather than producing nonsense", () => {
  assert.deepEqual(numbers(paginationWindow(0, 5)), [1, 2, 3, 4, 5]);
  assert.ok(numbers(paginationWindow(999, 51)).includes(51));
});

// Page count

it("counts pages, and respects the backend's ceiling", () => {
  assert.equal(lastPageFor(100, 10, 51), 10);
  assert.equal(lastPageFor(101, 10, 51), 11);
  assert.equal(lastPageFor(0, 10, 51), 0);
  // 18,000 bills at 10 a page is 1,800 pages; Convex caps the offset at 500,
  // so 51 is as far as the list can actually go.
  assert.equal(lastPageFor(18000, 10, 51), 51);
});

// Only an exact count may name a last page

it("an exact count names its last page and closes the bar", () => {
  assert.deepEqual(pagesForCount({ count: 120, exact: true }, 1, true, 50, 10), { lastPage: 3, openEnded: false });
});

it("a floor never becomes the last page", () => {
  // "At least 120" on page 1 of 50-per-page: pages 1–3 provably exist, more may.
  assert.deepEqual(pagesForCount({ count: 120, exact: false }, 1, true, 50, 10), { lastPage: 3, openEnded: true });
});

it("a floor still reaches the next page the current one proves", () => {
  assert.deepEqual(pagesForCount({ count: 120, exact: false }, 3, true, 50, 10), { lastPage: 4, openEnded: true });
});

it("no count at all still links onward instead of stranding page 2", () => {
  assert.deepEqual(pagesForCount({ count: null, exact: false }, 1, true, 50, 10), { lastPage: 2, openEnded: true });
  assert.deepEqual(pagesForCount(null, 1, true, 50, 10), { lastPage: 2, openEnded: true });
});

it("the last page with nothing after it closes the bar even without a count", () => {
  assert.deepEqual(pagesForCount({ count: null, exact: false }, 2, false, 50, 10), { lastPage: 2, openEnded: false });
});

it("never offers a page past what the backend can serve", () => {
  assert.deepEqual(pagesForCount({ count: 9000, exact: false }, 10, true, 50, 10), { lastPage: 10, openEnded: false });
});

if (failures.length) {
  console.error(`\npagination: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`pagination: all ${passed} tests passed`);
