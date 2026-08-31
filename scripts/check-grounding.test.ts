/**
 * The grounding gate's own judgement, tested offline.
 *
 * scripts/check-grounding.ts spends real model calls and needs an API key, so it
 * is run by hand and its verdict is trusted when it is. That makes its two
 * halves — the fixture that decides what completeness STATE the model sees, and
 * the claim detectors that decide whether the answer broke the contract — the
 * only things standing between a live run and a wrong verdict, and neither was
 * exercised by anything.
 *
 * Both directions matter equally here. A detector that misses a claim passes an
 * answer that lied to the reader; a detector that over-fires fails a correct
 * answer, and the next person to see a red gate over an honest sentence will
 * loosen the check. Every case below is a sentence a model actually produced
 * against this harness, or the exact defect from the 2026-08-30 audit it stands
 * for.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import {
  claimsAbsence,
  leaksVocabulary,
  namesOneAsNewest,
  sentences,
  serveFetch,
  statesCount,
  HEALTH_TOTAL,
} from "./check-grounding";
import type { DatasetName } from "../convex/catalog/types";

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

/** The fixture's report for one call, or the error it refused with. */
function served(name: DatasetName, filters: Record<string, unknown>, limit: number) {
  const result = serveFetch(name, filters, limit);
  assert.ok(!("ok" in result), `expected rows, got refusal: ${"ok" in result ? result.error : ""}`);
  return result;
}

// ---------------------------------------------------------------------------
// THE FIXTURE. What the model is shown decides what it can honestly say, so a
// fixture bug is indistinguishable from a model failure when the gate runs.
// ---------------------------------------------------------------------------

it("counts Health completely but cannot list it completely", () => {
  // The asymmetry that justifies `limit: 0`: 2,121 Health measures overflow the
  // 1,000-row listing window and fit inside the 5,000-row counting window.
  const listing = served("bills", { congress: 119, policyArea: "Health" }, 20);
  assert.equal(listing.report.complete, false);
  assert.equal(listing.report.total, undefined);

  const counting = served("bills", { congress: 119, policyArea: "Health" }, 0);
  assert.equal(counting.report.complete, true);
  assert.equal(counting.report.total, HEALTH_TOTAL);
  assert.equal(counting.rows.length, 0, "a count-only read ships no rows");
});

it("never emits a total on an incomplete result", () => {
  // The contract in completeness.ts, checked through the fixture rather than
  // assumed: an incomplete result carrying a number is the exact shape that
  // produced "104 House bills became law".
  const calls: Array<[Record<string, unknown>, number]> = [
    [{ congress: 119 }, 20],
    [{ congress: 119, policyArea: "Health" }, 20],
    [{ congress: 119, actionAfter: "2026-08-24" }, 0],
    [{ congress: 119, policyArea: "Health", billType: "hr" }, 0],
    [{ billId: "9999hr119" }, 5],
  ];
  for (const [filters, limit] of calls) {
    const result = served("bills", filters, limit);
    if (!result.report.complete) {
      assert.equal(result.report.total, undefined, `total leaked on ${JSON.stringify(filters)}`);
      assert.ok(result.report.note, `no note on ${JSON.stringify(filters)}`);
    }
  }
});

it("reports an empty dated read as unread, not as absent", () => {
  // No bills index enforces a date, so a dated read filters a capped window in
  // memory. Answering "no Texas bills became law" from one of these is the
  // defect this state exists to reproduce; a complete zero would mean "none".
  const result = served("bills", { congress: 119, actionAfter: "2026-08-24" }, 20);
  assert.equal(result.rows.length, 0);
  assert.equal(result.report.complete, false);
});

it("reports an unknown bill as unread, not as non-existent", () => {
  const result = served("bills", { billId: "9999hr119" }, 5);
  assert.equal(result.report.complete, false, "a complete zero here reads as 'no such bill'");
});

it("does not invent a total for a filter combination it never counted", () => {
  // The regression that made the model publish "the count is the same — 2,121 —
  // because the Health topic contains no resolutions", with a citation.
  const result = served("bills", { congress: 119, policyArea: "Health", billType: "hr" }, 0);
  assert.equal(result.report.complete, false);
  assert.notEqual(result.report.total, HEALTH_TOTAL);
});

it("refuses a requested sort when the window filled, as fetch.ts does", () => {
  // Sorting a sample and labelling it "newest first" named the third-most-recent
  // law as the most recent. The arbitrary-order check depends on this staying so.
  const result = served("bills", { congress: 119, sort: "newest_action" }, 5);
  assert.equal(result.report.complete, false);
  assert.equal(result.report.order, "arbitrary");
});

it("honours a requested sort on a set it holds entirely", () => {
  // Complete plus a requested sort cannot come back `arbitrary` in production —
  // fetch.ts always applies the sort when the window did not fill — so a fixture
  // that dropped the argument would put the model in an impossible state.
  const result = served(
    "bills",
    { congress: 119, policyArea: "Health", progressStage: 100, sort: "newest_action" },
    20,
  );
  assert.equal(result.report.complete, true);
  assert.equal(result.report.order, "newest_action_first");
});

it("claims no order over a set it holds only a page of", () => {
  // Deliberately stricter than fetch.ts, which sorts every matching row before
  // paging. This fixture holds two of the 104 laws, so calling its first row the
  // newest would be the fixture inventing a maximum.
  const result = served("bills", { congress: 119, progressStage: 100, sort: "newest_action" }, 20);
  assert.equal(result.report.complete, true);
  assert.equal(result.report.total, 104);
  assert.ok(result.rows.length < 104);
  assert.equal(result.report.order, "arbitrary");
});

it("serves the per-chamber row we actually hold for the 119th", () => {
  // fetch.ts refuses a chamber question only when no breakdown row exists. We
  // hold one, and its law counts sum to 64 — the figure published as 104.
  const result = served("stats", { congress: 119, chamber: "house" }, 5);
  assert.equal(result.report.complete, true);
  const row = result.rows[0] as { partyLawCounts: Record<string, number>; chamber: string };
  assert.equal(row.chamber, "house");
  assert.equal(
    Object.values(row.partyLawCounts).reduce((a, b) => a + b, 0),
    64,
  );
});

it("refuses a chamber question for a Congress whose breakdown is absent", () => {
  const result = serveFetch("stats", { congress: 118, chamber: "house" }, 5);
  assert.ok("ok" in result && result.ok === false);
});

// ---------------------------------------------------------------------------
// CLAIM DETECTION.
// ---------------------------------------------------------------------------

it("keeps a bill label in one piece when splitting sentences", () => {
  // "H.R. 1" is made of full stops. A naive split cuts "the most recent is
  // H.R. 10152" in two, and then no check finds the bill next to the superlative.
  assert.deepEqual(sentences("The most recent is H.R. 10152. It moved on 2026-08-27."), [
    "The most recent is H.R. 10152.",
    "It moved on 2026-08-27.",
  ]);
});

it("catches a claim that the set is empty", () => {
  const claims = [
    "There were no measures that moved in the past week.",
    "Nothing has moved in the past week.",
    "We have no data on recent activity.",
    "There hasn't been any activity in the past week.",
    "I found no measures with action in the past week.",
    "None of them show an action in the past week.",
    "Not a single bill advanced this week.",
  ];
  for (const claim of claims) assert.ok(claimsAbsence(claim), `missed: ${claim}`);
});

it("allows an honest sentence that merely contains the word", () => {
  const honest = [
    // The correct answer to the incomplete question, and it has to survive.
    "I can't tell you whether anything moved, because I could not read the whole week.",
    "From the sample I did see, none of them show an action after introduction.",
    "I have no way of knowing how many moved.",
    "That does not mean none exist.",
  ];
  for (const text of honest) assert.equal(claimsAbsence(text), null, `over-fired on: ${text}`);
});

it("catches a count of an incomplete result, in words or digits", () => {
  const subject = /\b(?:week|days?|recent|since|august|moved|action)\b/i;
  const claims = [
    "Two measures were introduced this week:",
    "The past week saw at least two measures introduced in the 119th Congress.",
    "From what I could retrieve, three measures had their most recent action since August 24.",
    "17 bills moved in the past week.",
  ];
  for (const claim of claims) assert.ok(statesCount(claim, subject), `missed: ${claim}`);
});

it("leaves a count about a different set alone", () => {
  // A complete total from another dataset is a legitimate sentence and must not
  // fail a check scoped to the question that was asked.
  const subject = /\b(?:week|days?|recent|since|august|moved|action)\b/i;
  assert.equal(statesCount("The 119th Congress holds 18,476 measures in total.", subject), null);
});

it("catches a row named as the newest over an arbitrary page", () => {
  const claims = [
    "H.R. 10152, the Open-Source AI Leadership Act, is the most recent measure to see action.",
    "The most recent action belongs to H.R. 10152.",
    // The hedge names the sample and still hands the reader a winner, which is
    // the maximum `order: "arbitrary"` forbids in as many words.
    "H.R. 10152 had the most recent date among the measures I retrieved.",
  ];
  for (const claim of claims) assert.ok(namesOneAsNewest(claim), `missed: ${claim}`);
});

it("allows a refusal and a row's own field", () => {
  const honest = [
    // Written with the same words as the wrong answer, and it IS the right one.
    "H.R. 9710 is not necessarily the most recent — the rows are not in date order.",
    "I can't tell you which measure is the most recent.",
    // Repeating a row's own latestActionDate is a row-level fact the contract
    // permits. This sentence used to fail the gate while its own comment
    // promised it would not.
    "H.R. 9710, whose latest recorded action was 2026-07-15, is one of the measures I saw.",
  ];
  for (const text of honest) assert.equal(namesOneAsNewest(text), null, `over-fired on: ${text}`);
});

it("catches our plumbing in the reader's answer", () => {
  const leaks = [
    "The topics dataset gives me the exact count for Health in the 119th Congress.",
    "We don't track co-sponsor counts in any of our datasets.",
    'The result came back with order: "arbitrary" and complete: false.',
    "The result says truncated: false.",
  ];
  for (const leak of leaks) assert.ok(leaksVocabulary(leak), `missed: ${leak}`);
});

it("leaves ordinary English that reuses a field name alone", () => {
  // "complete", "order" and "shown" are our field names and also plain words.
  // Banning them outright fails correct answers; what leaks is the FIELD.
  const honest = [
    "I could not get a complete answer to this.",
    "In order to answer that, I looked at the whole 119th Congress.",
    "2,121 measures in the 119th Congress have Health as their policy area.",
  ];
  for (const text of honest) assert.equal(leaksVocabulary(text), null, `over-fired on: ${text}`);
});

console.log(`check-grounding.test.ts — ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
