/**
 * The scoring rules of the answer-accuracy harness.
 *
 * The harness itself (check-answers.ts) is NOT a unit test — it spends real
 * model calls against production. This file is, and it is free and hermetic: it
 * never reads .truth-cache/, never shells out and never asks anything. It
 * covers the part where a mistake is most expensive, because a scorer that
 * turns a wrong answer into a green check is worse than no harness at all: it
 * would have blessed all 41 defects in the 2026-08-30 audit.
 *
 * It also pins the boundary that keeps `pnpm test` free. Importing
 * check-answers.ts must not ask production; if this file starts taking minutes
 * and costing money, the entry-point guard at the bottom of that module is gone.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { parseAskOutput, scoreRun, worstOutcome } from "./check-answers";
import type { RunResult } from "./check-answers";
import { QUESTIONS } from "./questions";
import type { Expected } from "./questions";

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

const run = (outcome: RunResult["outcome"]): RunResult => ({ outcome, got: "" });

// --- worst-of-N -------------------------------------------------------------

it("takes the worst run, because a defect that reproduces 2 times in 3 is a defect", () => {
  assert.equal(worstOutcome([run("CORRECT"), run("WRONG"), run("CORRECT")]), "WRONG");
});

it("does not let a correct run cover for an unscoreable one", () => {
  // UNCHECKABLE is not a pass. A deployment that "improves" by refusing to
  // answer must not read as green.
  assert.equal(worstOutcome([run("CORRECT"), run("UNCHECKABLE")]), "UNCHECKABLE");
});

// --- numbers ----------------------------------------------------------------

const total: Expected = { kind: "number", value: 104, note: "" };
const senatePassed: Expected = { kind: "number", value: 176, tolerance: 10, note: "" };

it("scores the true count correct", () => {
  const r = scoreRun(total, { text: "104 bills have become law in the 119th Congress." });
  assert.equal(r.outcome, "CORRECT");
  assert.equal(r.got, "104");
});

it("refuses an answer that asserts more than one number", () => {
  // Shipped to a reader: 56 + 8 = 64 contradicts the 104 in the same paragraph.
  // Any pick-a-number rule scores this as a pass.
  const r = scoreRun(total, {
    text: "104 House bills became law; the party split is 56 Republican and 8 Democratic.",
  });
  assert.equal(r.outcome, "UNCHECKABLE");
});

it("accepts inside the band and rejects the wrong buckets outside it", () => {
  // 176 by progressStage, 186 by "Passed Senate" actions — both defensible
  // readings of our data. 194 is the all-chamber terminal bucket, which is the
  // answer the defect gave.
  assert.equal(scoreRun(senatePassed, { text: "186 Senate bills have passed." }).outcome, "CORRECT");
  assert.equal(scoreRun(senatePassed, { text: "194 bills have passed." }).outcome, "WRONG");
  assert.equal(scoreRun(senatePassed, { text: "142 bills have passed." }).outcome, "WRONG");
});

// --- booleans ---------------------------------------------------------------

const anyTexasLaws: Expected = { kind: "boolean", value: true, note: "" };

it("scores the production Texas denial WRONG, and keeps the words it used", () => {
  // The shipped falsehood: eleven Texas-sponsored bills had become law.
  const r = scoreRun(anyTexasLaws, {
    text: "No — we don’t have data on Texas bills that became law.",
  });
  assert.equal(r.outcome, "WRONG");
  assert.match(r.said ?? "", /don’t have data on Texas/);
});

it("scores a yes with a count correct", () => {
  const r = scoreRun(anyTexasLaws, { text: "Yes, 11 Texas-sponsored bills have become law." });
  assert.equal(r.outcome, "CORRECT");
});

// --- bill ids ---------------------------------------------------------------

const mostRecentLaw: Expected = { kind: "billId", value: "629s119", note: "" };

it("matches the printed bill reference, not the row that happened to be first", () => {
  const r = scoreRun(mostRecentLaw, { text: "The most recent law is S. 629, on 2026-07-12." });
  assert.equal(r.outcome, "CORRECT");
  assert.equal(r.got, "629s119");
});

it("scores a different bill WRONG", () => {
  const r = scoreRun(mostRecentLaw, { text: "The most recent law is H.R. 6644." });
  assert.equal(r.outcome, "WRONG");
  assert.equal(r.got, "6644hr119");
});

// --- names ------------------------------------------------------------------

const fewestInCalifornia: Expected = { kind: "name", value: "James Gallagher", note: "" };

it("scores the audit's wrong member WRONG and says who was expected", () => {
  const r = scoreRun(fewestInCalifornia, {
    text: "The California member with the fewest bills is Tom McClintock, with 25.",
  });
  assert.equal(r.outcome, "WRONG");
  assert.equal(r.got, "does not name James Gallagher");
  assert.match(r.said ?? "", /McClintock/);
});

it("scores the true member correct without repeating the whole answer", () => {
  const r = scoreRun(fewestInCalifornia, {
    text: "**James Gallagher** has introduced the fewest, with 5.",
  });
  assert.equal(r.outcome, "CORRECT");
  assert.equal(r.said, undefined);
});

it("KNOWN LIMIT: a name answer that also names the right member scores CORRECT", () => {
  // Documented, not desired. Unlike extractNumber, a substring match cannot see
  // a second name, so an answer asserting McClintock while mentioning Gallagher
  // passes. The one-sentence, one-name directive on every name question is what
  // keeps this out of practice. If that stops holding, this expectation flips
  // to UNCHECKABLE and scoreText grows an ambiguity refusal.
  const r = scoreRun(fewestInCalifornia, {
    text: "Tom McClintock has the fewest, ahead of James Gallagher.",
  });
  assert.equal(r.outcome, "CORRECT");
});

// --- non-answers ------------------------------------------------------------

it("counts an error, an empty answer and a question back as unscoreable", () => {
  assert.equal(scoreRun(total, { error: "convex run failed" }).outcome, "UNCHECKABLE");
  assert.equal(scoreRun(total, { text: "   " }).outcome, "UNCHECKABLE");
  const asked = scoreRun(total, { text: "Which Congress do you mean?", askedReader: true });
  assert.equal(asked.outcome, "UNCHECKABLE");
  assert.match(asked.said ?? "", /Which Congress/);
});

// --- reading the CLI --------------------------------------------------------

it("finds the result object under the CLI's own chatter", () => {
  const stdout = [
    "✔ Provisioned a deployment",
    '{"level":"info","msg":"a log line that is itself JSON"}',
    "{",
    '  "text": "104 bills.",',
    '  "sources": [',
    '    { "id": "1" }',
    "  ],",
    '  "askedReader": false',
    "}",
  ].join("\n");
  const parsed = parseAskOutput(stdout);
  assert.equal(parsed?.text, "104 bills.");
});

it("returns null rather than guessing when there is no result object", () => {
  assert.equal(parseAskOutput("Error: something went wrong\n"), null);
});

// --- the question set is the contract ---------------------------------------

it("still asks about every defect the harness was built for", () => {
  // Deleting one of these silently stops checking a falsehood that shipped with
  // citations attached. Adding questions needs no change here.
  const required = [
    "most-recent-law",
    "house-laws",
    "senate-laws",
    "senate-passed-a-chamber",
    "bills-introduced",
    "health-laws",
    "texas-laws",
    "eighteenth-still-in-committee",
    "california-fewest-bills",
    "california-member-count",
    "two-word-surname",
    "control-total-laws",
    "control-largest-topic",
  ];
  const ids = new Set(QUESTIONS.map((q) => q.id));
  for (const id of required) assert.ok(ids.has(id), `question '${id}' is gone`);
  assert.equal(ids.size, QUESTIONS.length, "duplicate question id");
});

it("keeps both controls, so a harness that reports everything broken is visible", () => {
  const controls = QUESTIONS.filter((q) => q.defect.startsWith("CONTROL"));
  assert.ok(controls.length >= 2, "fewer than two control questions");
});

it("gives every question an answer-shape directive", () => {
  // The name scoring above leans on answers naming one member, and extractNumber
  // refuses when two numbers survive. Without the directive an unconstrained
  // answer volunteers six counts and nearly everything scores UNCHECKABLE.
  for (const q of QUESTIONS) {
    assert.match(q.question, /in one short sentence\.$/, `${q.id} has no shape directive`);
    assert.ok(q.defect.length > 0, `${q.id} does not name the falsehood it catches`);
  }
});

console.log(`\ntruth/check-answers: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
