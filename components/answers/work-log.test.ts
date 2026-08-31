/**
 * The words the grounding trail puts in front of the reader.
 *
 * D26: the trail printed "Searched sponsors · 29 matches" for a search that had
 * examined a fraction of the set. The number was real but unaudited, it read as
 * audited, and the California answer built on it was wrong (54, not 29). These
 * tests hold the line that a partial search shows no number, and that the
 * string this file matches on is still the string the server actually sends.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workLine } from "./work-log";
import {
  completeReport,
  reportFor,
  workLogLabel,
} from "../../convex/catalog/completeness";

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

/** The detail string convex/answer.ts builds for a fetch, verbatim. */
const fetchDetail = (dataset: string, label: string) => `${dataset} · ${label}`;

const complete = completeReport({
  set: "every California sponsor in the 119th Congress",
  total: 54,
  shown: 25,
  order: "most_bills_first",
});

const partial = reportFor({
  set: "every California sponsor in the 119th Congress",
  windowFilled: true,
  filteredInMemory: true,
  matchedCount: 29,
  shown: 25,
  order: "arbitrary",
});

it("shows an audited count exactly as it always did", () => {
  const line = workLine({ tool: "fetch", detail: fetchDetail("sponsors", workLogLabel(complete)) });
  assert.equal(line.text, "Searched sponsors · 54 matches");
  assert.equal(line.aside, undefined);
});

it("never puts a number on a partial search", () => {
  const line = workLine({ tool: "fetch", detail: fetchDetail("sponsors", workLogLabel(partial)) });
  assert.ok(!/\d/.test(line.text), `partial line still carries a digit: ${line.text}`);
  assert.ok(!/\d/.test(line.aside ?? ""), `partial aside still carries a digit: ${line.aside}`);
  // 29 was the row count that survived an in-memory filter over a capped
  // window. It exists in the handler; it must never reach the reader.
  assert.ok(!line.text.includes("29"));
});

it("says a partial search was partial, in plain words", () => {
  const line = workLine({ tool: "fetch", detail: fetchDetail("sponsors", workLogLabel(partial)) });
  assert.equal(line.text, "Searched sponsors · partial results");
  assert.equal(line.aside, "no count available");
});

it("does not describe a partial search as a failure", () => {
  const line = workLine({ tool: "fetch", detail: fetchDetail("sponsors", workLogLabel(partial)) });
  const words = `${line.text} ${line.aside ?? ""}`.toLowerCase();
  for (const alarm of ["error", "fail", "incomplete", "warning", "unable", "sorry"]) {
    assert.ok(!words.includes(alarm), `partial line reads as an error: ${words}`);
  }
});

it("keeps the label in step with the string the server sends", () => {
  // The component matches workLogLabel's partial sentence as a whole string. If
  // that wording is edited without editing work-log.tsx, this fails here rather
  // than shipping the raw sentence into the trail.
  const line = workLine({ tool: "fetch", detail: fetchDetail("sponsors", workLogLabel(partial)) });
  assert.ok(
    !line.text.includes(workLogLabel(partial)),
    "work-log.tsx no longer recognises the partial label from completeness.ts",
  );
});

it("labels a scope seed with a partial count the same way", () => {
  // seed() builds `${scope.label} · ${count}`, which reaches the same branch.
  const line = workLine({
    tool: "fetch",
    detail: `Health bills in the 119th · ${workLogLabel(partial)}`,
  });
  assert.equal(line.text, "Searched Health bills in the 119th · partial results");
  assert.equal(line.aside, "no count available");
});

it("reads an ask as asking the reader, not as a search", () => {
  const line = workLine({ tool: "ask", detail: "needs one detail before answering" });
  assert.ok(!line.text.toLowerCase().includes("searched"), line.text);
  assert.equal(line.text, "Asked you a question · needs one detail before answering");
});

it("leaves describe and web lines untouched", () => {
  assert.equal(
    workLine({ tool: "describe", detail: "sponsors" }).text,
    "Read the sponsors field guide",
  );
  assert.equal(
    workLine({ tool: "web", detail: "the vote happened after our last sync" }).text,
    "Searched the web · the vote happened after our last sync",
  );
});

it("does not dim any of its own text below the contrast floor", () => {
  // The first fix for D26 dimmed the "(no count available)" caveat to 70%.
  // --muted-foreground is already only 5.26:1 against --background (40 30% 97%,
  // the surface the ask panel is painted on); at 70% it composites to 2.62:1,
  // under the 4.5:1 WCAG AA floor for this 11px text and under even the 3:1
  // large-text floor. Because the base is 5.26:1 there is no dimming budget at
  // all — any alpha here fails — so the rule is that the trail dims nothing.
  // The brackets carry the footnote weight instead.
  const source = readFileSync("components/answers/work-log.tsx", "utf8");
  const dimmed = source.match(/opacity-\d|-foreground\/\d/g);
  assert.equal(dimmed, null, `work-log.tsx dims its own text: ${dimmed?.join(", ")}`);
});

it("passes an unrecognised detail through rather than guessing", () => {
  const line = workLine({ tool: "fetch", detail: "bills · invalid request, retrying" });
  assert.equal(line.text, "Searched bills · invalid request, retrying");
  assert.equal(line.aside, undefined);
});

console.log(`\nanswers/work-log: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
