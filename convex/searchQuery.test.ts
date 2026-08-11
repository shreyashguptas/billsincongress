/**
 * Unit tests for shaping reader text into a Convex-legal search query. Pure
 * functions, so they carry a permanent regression test.
 *
 * These limits are enforced by Convex as errors, not silent truncations, so a
 * regression here does not degrade search — it breaks it for whoever typed the
 * offending query. Cases below are drawn from real queries in the
 * bills_no_results logs.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework;
 * excluded from Convex bundling via `.test.ts`.
 */
import assert from "node:assert/strict";
import {
  sanitizeSearchQuery,
  truncateToBytes,
  SEARCH_MAX_TERMS,
  SEARCH_MAX_TERM_BYTES,
} from "./searchQuery";

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

const termCount = (s: string) => (s === "" ? 0 : s.split(" ").length);
const byteLength = (s: string) => new TextEncoder().encode(s).length;

// --- ordinary queries pass through untouched -------------------------------

it("leaves a normal query unchanged", () => {
  assert.equal(sanitizeSearchQuery("sunshine protection act"), "sunshine protection act");
});

it("leaves a single term unchanged", () => {
  assert.equal(sanitizeSearchQuery("NDAA"), "NDAA");
});

it("preserves case, so relevance ranking sees what was typed", () => {
  assert.equal(sanitizeSearchQuery("Kids Online Safety Act"), "Kids Online Safety Act");
});

// --- whitespace handling ---------------------------------------------------

it("collapses runs of whitespace into single separators", () => {
  assert.equal(sanitizeSearchQuery("kids   online\t\tsafety"), "kids online safety");
});

it("trims leading and trailing whitespace", () => {
  assert.equal(sanitizeSearchQuery("  medicare  "), "medicare");
});

it("returns empty string for whitespace-only input", () => {
  assert.equal(sanitizeSearchQuery("   \t\n "), "");
});

it("returns empty string for empty input", () => {
  assert.equal(sanitizeSearchQuery(""), "");
});

// --- the 16-term ceiling --------------------------------------------------

it("keeps a query that sits exactly on the term limit", () => {
  const q = Array.from({ length: SEARCH_MAX_TERMS }, (_, i) => `w${i}`).join(" ");
  assert.equal(termCount(sanitizeSearchQuery(q)), SEARCH_MAX_TERMS);
  assert.equal(sanitizeSearchQuery(q), q);
});

it("drops terms past the limit rather than throwing", () => {
  const q = Array.from({ length: 40 }, (_, i) => `w${i}`).join(" ");
  const out = sanitizeSearchQuery(q);
  assert.equal(termCount(out), SEARCH_MAX_TERMS);
  // Keeps the leading terms — the ones the reader typed first.
  assert.equal(out.split(" ")[0], "w0");
  assert.equal(out.split(" ")[SEARCH_MAX_TERMS - 1], `w${SEARCH_MAX_TERMS - 1}`);
});

it("handles a real over-long pasted query from the logs", () => {
  // Verbatim from bills_no_results — 25 words, which would exceed the limit.
  const pasted =
    "Establishing a Fixed Time Period of Admission and an Extension of Stay " +
    "Procedure for Nonimmigrant Academic Students, Exchange Visitors, and " +
    "Representatives of Foreign Information Media";
  assert.ok(pasted.split(/\s+/).length > SEARCH_MAX_TERMS, "fixture must exceed the limit");
  const out = sanitizeSearchQuery(pasted);
  assert.equal(termCount(out), SEARCH_MAX_TERMS);
  assert.ok(out.startsWith("Establishing a Fixed Time Period"));
});

// --- the 32-byte per-term ceiling ----------------------------------------

it("keeps a term exactly on the byte limit", () => {
  const term = "a".repeat(SEARCH_MAX_TERM_BYTES);
  assert.equal(sanitizeSearchQuery(term), term);
});

it("truncates an over-long single term", () => {
  const term = "a".repeat(100);
  const out = sanitizeSearchQuery(term);
  assert.equal(byteLength(out), SEARCH_MAX_TERM_BYTES);
});

it("truncates over-long terms independently, keeping the others intact", () => {
  const out = sanitizeSearchQuery(`veterans ${"z".repeat(60)} act`);
  const terms = out.split(" ");
  assert.equal(terms.length, 3);
  assert.equal(terms[0], "veterans");
  assert.equal(byteLength(terms[1]), SEARCH_MAX_TERM_BYTES);
  assert.equal(terms[2], "act");
});

// --- multi-byte characters: the limit is bytes, not characters -------------

it("counts bytes, not characters, when truncating", () => {
  // Each "é" is 2 bytes in UTF-8, so 20 of them exceed a 32-byte limit at only
  // 20 characters. A character-based slice would let this through.
  const out = truncateToBytes("é".repeat(20), SEARCH_MAX_TERM_BYTES);
  assert.ok(byteLength(out) <= SEARCH_MAX_TERM_BYTES);
  assert.equal(out.length, 16);
});

it("never splits a multi-byte character", () => {
  // 4-byte emoji against an odd byte budget: the result must stay valid UTF-8
  // and contain only whole characters.
  const out = truncateToBytes("🏛️".repeat(10), 15);
  assert.ok(byteLength(out) <= 15);
  assert.ok(!out.includes("�"), "must not contain a replacement character");
  assert.equal(out, [...out].join(""), "must consist of whole characters");
});

it("leaves a short multi-byte term alone", () => {
  assert.equal(sanitizeSearchQuery("café"), "café");
});

// --- both limits at once --------------------------------------------------

it("applies the term ceiling and the byte ceiling together", () => {
  const q = Array.from({ length: 30 }, () => "y".repeat(50)).join(" ");
  const out = sanitizeSearchQuery(q);
  const terms = out.split(" ");
  assert.equal(terms.length, SEARCH_MAX_TERMS);
  for (const term of terms) {
    assert.equal(byteLength(term), SEARCH_MAX_TERM_BYTES);
  }
});

if (failures.length > 0) {
  console.error(`\nsearchQuery: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`searchQuery: all ${passed} tests passed`);
