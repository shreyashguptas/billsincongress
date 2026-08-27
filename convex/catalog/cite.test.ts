/**
 * Provenance resolution (spec §4.5).
 *
 * This is the mechanism that makes a fabricated citation impossible: the model
 * writes handles, never URLs, and any handle it did not actually receive is
 * deleted before display. These tests are the guarantee — treat a failure here
 * as a correctness bug, not a formatting one.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { mintHandle, parseMarkers, resolveAnswer } from "./cite";

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

it("mints a handle from a dataset and id", () => {
  assert.equal(mintHandle("bills", "1234hr119"), "bills:1234hr119");
  assert.equal(mintHandle("topics", "119:Health"), "topics:119:Health");
});

it("parses a single marker", () => {
  assert.deepEqual(parseMarkers("Text.[[cite:bills:1234hr119]]"), ["bills:1234hr119"]);
});

it("parses several markers, preserving order", () => {
  const text = "A[[cite:bills:1hr119]] and B[[cite:topics:119:Health]]";
  assert.deepEqual(parseMarkers(text), ["bills:1hr119", "topics:119:Health"]);
});

it("parses adjacent markers", () => {
  assert.deepEqual(parseMarkers("X[[cite:bills:1hr119]][[cite:bills:2hr119]]"), [
    "bills:1hr119",
    "bills:2hr119",
  ]);
});

it("finds no markers in ordinary prose", () => {
  assert.deepEqual(parseMarkers("No citations here at all."), []);
});

it("keeps a marker the model was actually given, and numbers it", () => {
  const out = resolveAnswer("Health leads.[[cite:topics:119:Health]]", new Set(["topics:119:Health"]));
  assert.deepEqual(out.sources, ["topics:119:Health"]);
  assert.equal(out.dropped, 0);
  assert.ok(out.text.includes("[1]"), `expected a [1] marker, got: ${out.text}`);
  assert.ok(!out.text.includes("[[cite:"), "raw marker must not survive");
});

it("DELETES a handle the model invented", () => {
  const out = resolveAnswer("Made up.[[cite:bills:9999zz999]]", new Set(["bills:1hr119"]));
  assert.equal(out.sources.length, 0);
  assert.equal(out.dropped, 1);
  assert.equal(out.text, "Made up.");
});

it("keeps the real handle and drops the invented one in the same answer", () => {
  const out = resolveAnswer(
    "Real[[cite:bills:1hr119]] and fake[[cite:bills:9999zz999]].",
    new Set(["bills:1hr119"]),
  );
  assert.deepEqual(out.sources, ["bills:1hr119"]);
  assert.equal(out.dropped, 1);
  assert.ok(out.text.includes("[1]"));
  assert.ok(!out.text.includes("9999zz999"));
});

it("numbers a repeated handle once and reuses the number", () => {
  const out = resolveAnswer(
    "A[[cite:bills:1hr119]] then B[[cite:bills:1hr119]]",
    new Set(["bills:1hr119"]),
  );
  assert.deepEqual(out.sources, ["bills:1hr119"]);
  assert.equal(out.text.match(/\[1\]/g)?.length, 2);
});

it("resolves web handles the same way as database handles", () => {
  const out = resolveAnswer("Reported.[[cite:web:1]]", new Set(["web:1"]));
  assert.deepEqual(out.sources, ["web:1"]);
  assert.equal(out.dropped, 0);
});

it("leaves a malformed marker as plain text rather than throwing", () => {
  const out = resolveAnswer("Broken [[cite:]] and [[cite]] here.", new Set(["bills:1hr119"]));
  assert.equal(out.dropped, 0);
  assert.ok(out.text.includes("Broken"));
});

console.log(`\ncatalog/cite: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
