/**
 * Extractor tests. The fixtures are production answer text and real rows from
 * the 119th Congress (H.R. 6644, S. 629, James Gallagher of CA, Tom McClintock),
 * so a rule that only works on invented prose fails here.
 *
 * The refusal cases matter most: every one of them is a defect the audit found
 * shipped to readers, and a lenient extractor would score each as a pass.
 *
 * Run with: ./node_modules/.bin/tsx scripts/truth/extract.test.ts
 */
import assert from "node:assert/strict";
import { containsName, extractBillId, extractBoolean, extractNumber } from "./extract";

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

/** Narrow to the found case so the tests can read `.value` without casts. */
function found(result: ReturnType<typeof extractNumber>) {
  assert.equal(result.found, true, `expected a value, got refusal: ${JSON.stringify(result)}`);
  return result as { found: true; value: string | number | boolean };
}

function refused(result: ReturnType<typeof extractNumber>) {
  assert.equal(result.found, false, `expected a refusal, got ${JSON.stringify(result)}`);
  return result as { found: false; reason: string };
}

// --- extractNumber -------------------------------------------------------

it("reads a single count", () => {
  assert.equal(found(extractNumber("Tom McClintock introduced 25 bills.")).value, 25);
});

it("reads a thousands separator", () => {
  const text = "The 119th Congress has 18,476 bills in the site's data.";
  assert.equal(found(extractNumber(text)).value, 18476);
});

it("refuses the self-contradicting party-split answer", () => {
  // Shipped to readers: 56 + 8 = 64, not 104. Scoring this against either
  // number would have called a wrong answer correct.
  const production =
    "104 House bills became law in the 119th Congress. Of those, the party split " +
    "is 56 Republican and 8 Democratic.";
  const reason = refused(extractNumber(production)).reason;
  assert.ok(reason.includes("ambiguous"), `reason should say ambiguous: ${reason}`);
  for (const n of ["104", "56", "8"]) {
    assert.ok(reason.includes(n), `reason should list ${n}: ${reason}`);
  }
});

it("refuses when the answer states no number", () => {
  const reason = refused(
    extractNumber("The site does not break that down by committee."),
  ).reason;
  assert.ok(reason.includes("no number"), reason);
});

it("ignores ordinal Congress references", () => {
  assert.equal(found(extractNumber("In the 119th Congress, 64 bills became law.")).value, 64);
  assert.equal(found(extractNumber("Carried over from the 118th, 3 remain.")).value, 3);
});

it("ignores citation markers", () => {
  assert.equal(found(extractNumber("Eleven have become law [1][2].")).value, 11);
  assert.equal(found(extractNumber("There are 59 such bills [[bills:119]].")).value, 59);
});

it("ignores years and dates", () => {
  const text = "H.R. 6644 was introduced on 2025-11-20 and has 12 cosponsors.";
  assert.equal(found(extractNumber(text)).value, 12);
  assert.equal(found(extractNumber("Since 2021, 7 have been vetoed.")).value, 7);
  assert.equal(found(extractNumber("On April 24, 2025, 40 bills were filed.")).value, 40);
});

it("ignores printed bill numbers", () => {
  // "H.R. 6644" and "S. 629" are labels, not counts; the claim is the 2.
  const text = "H.R. 6644 and S. 629 are the 2 bills that match.";
  assert.equal(found(extractNumber(text)).value, 2);
});

it("ignores composite ids and link targets", () => {
  const text =
    "[S. 629](https://billsincongress.com/bills/629s119) is 1 of the matching bills.";
  assert.equal(found(extractNumber(text)).value, 1);
});

it("reads small numbers written as words", () => {
  assert.equal(found(extractNumber("Eleven Texas bills have become law.")).value, 11);
  // The two-word-surname defect: members reported as having introduced none.
  assert.equal(found(extractNumber("James Gallagher introduced zero bills.")).value, 0);
});

it("counts word numbers in the ambiguity check", () => {
  const reason = refused(
    extractNumber("Eleven became law, though 12 passed the House."),
  ).reason;
  assert.ok(reason.includes("ambiguous"), reason);
  assert.ok(reason.includes("11") && reason.includes("12"), reason);
});

it("reads a hyphenated word number as one number", () => {
  // "Sixty-four" is the audit's real count of House bills that became law,
  // against production's claimed 104. Reading it as the 4 alone would have
  // scored the right answer wrong and, worse, an answer of "twenty-five" — Tom
  // McClintock's count — as the 5 that is actually James Gallagher's.
  assert.equal(found(extractNumber("Sixty-four House bills became law.")).value, 64);
  assert.equal(
    found(extractNumber("James Gallagher introduced twenty-five bills.")).value,
    25,
  );
  assert.equal(found(extractNumber("Fifty bills remain in committee.")).value, 50);
});

it("refuses a spelled-out magnitude rather than guessing", () => {
  // The audit's own phrasing. This used to return 7, with found:true.
  const reason = refused(
    extractNumber("Thirty-seven thousand bills are still sitting in committee."),
  ).reason;
  assert.ok(reason.includes("unparsed"), reason);
  assert.equal(extractNumber("One hundred bills became law.").found, false);
});

it("treats 'one of' as a pronoun, not a count", () => {
  assert.equal(found(extractNumber("That is one of the 54 California members.")).value, 54);
});

it("refuses the California answer that hides its own gaps", () => {
  // Production named McClintock as the fewest; it is Gallagher with 5, and 25 of
  // California's 54 members were missing from the answer entirely.
  const reason = refused(
    extractNumber("James Gallagher introduced 5 bills, fewest of California's 54 members."),
  ).reason;
  assert.ok(reason.includes("ambiguous"), reason);
});

// --- extractBillId -------------------------------------------------------

it("reads the printed forms with and without a space", () => {
  assert.equal(found(extractBillId("S. 629 — Emergency Conservation Program Improvement Act")).value, "629s119");
  assert.equal(found(extractBillId("H.R.6644, the 21st Century ROAD to Housing Act")).value, "6644hr119");
  assert.equal(found(extractBillId("**H.R. 6644** was reported out of committee.")).value, "6644hr119");
});

it("takes the first named bill as the claim", () => {
  const text =
    "H.R. 6644 is the housing bill. For context, S. 629 covers conservation and " +
    "H.J.Res. 183 is a disapproval resolution.";
  assert.equal(found(extractBillId(text)).value, "6644hr119");
});

it("supports every stored bill type", () => {
  const cases: Array<[string, string]> = [
    ["H.R. 3028", "3028hr119"],
    ["S. 629", "629s119"],
    ["H.J.Res. 183", "183hjres119"],
    ["S.J.Res. 88", "88sjres119"],
    ["H.Con.Res. 74", "74hconres119"],
    ["S.Con.Res. 24", "24sconres119"],
    ["H.Res. 1049", "1049hres119"],
    ["S.Res. 482", "482sres119"],
  ];
  for (const [printed, id] of cases) {
    assert.equal(found(extractBillId(printed)).value, id, `${printed} should be ${id}`);
  }
});

it("honours a non-default congress", () => {
  assert.equal(found(extractBillId("H.R. 3028 in the 118th Congress", 118)).value, "3028hr118");
});

it("refuses when no bill is named", () => {
  const reason = refused(extractBillId("Eleven Texas bills have become law.")).reason;
  assert.ok(reason.includes("no bill"), reason);
});

it("does not mistake prose or link targets for a bill", () => {
  // "U.S." and a bare composite id in a URL are not the model naming a bill.
  assert.equal(extractBillId("Section 5 of the U.S. Code applies.").found, false);
  assert.equal(extractBillId("See https://billsincongress.com/bills/629s119").found, false);
  // A possessive read as "S. 54" and invented a bill out of a member count.
  assert.equal(extractBillId("fewest of California's 54 members").found, false);
});

// --- containsName --------------------------------------------------------

it("matches a name through markdown and punctuation", () => {
  assert.equal(containsName("**James Gallagher**, who introduced 5 bills", "James Gallagher"), true);
  assert.equal(containsName("Rep. James Gallagher's bills", "James Gallagher"), true);
  assert.equal(containsName("introduced by JAMES  GALLAGHER.", "James Gallagher"), true);
});

it("matches two-word surnames", () => {
  assert.equal(containsName("Sen. Catherine Cortez Masto (D-NV)", "Catherine Cortez Masto"), true);
  assert.equal(containsName("Rep. Jefferson Van Drew filed it.", "Van Drew"), true);
});

it("matches across accents, which our own data spells both ways", () => {
  // The sponsor table holds "Nydia Velázquez" and "NYDIA VELAZQUEZ", and
  // "Jenniffer González-Colón" and "Jenniffer Gonzalez-Colon", for the same
  // members. Without folding, the eight members of the 119th whose names carry
  // a diacritic could never be confirmed, and every correct answer about them
  // would read as the missing-member defect the audit found.
  assert.equal(containsName("Sponsored by Nydia Velazquez.", "Nydia Velázquez"), true);
  assert.equal(containsName("Sponsored by Nydia Velázquez.", "NYDIA VELAZQUEZ"), true);
  assert.equal(containsName("Rep. Jenniffer Gonzalez-Colon", "Jenniffer González-Colón"), true);
  assert.equal(containsName("Nanette Barragan of California", "Nanette Barragán"), true);
  // Folding must not make two different members the same person.
  assert.equal(containsName("Jesús García introduced 8 bills.", "Sylvia Garcia"), false);
});

it("does not match a different member", () => {
  assert.equal(containsName("Tom McClintock introduced the fewest.", "James Gallagher"), false);
});

it("respects word boundaries", () => {
  // Substring matching on raw text would let "Hill" match "Hillary".
  assert.equal(containsName("Sponsored by Hillary Scholten.", "Hill"), false);
  assert.equal(containsName("Sponsored by J. Hill.", "Hill"), true);
  assert.equal(containsName("anything", ""), false);
});

// --- extractBoolean ------------------------------------------------------

it("reads clear affirmatives", () => {
  assert.equal(found(extractBoolean("Yes. Texas bills have become law.")).value, true);
  assert.equal(found(extractBoolean("There are 11 Texas bills that became law.")).value, true);
  assert.equal(found(extractBoolean("Eleven have become law.")).value, true);
  assert.equal(found(extractBoolean("We do track vetoed bills.")).value, true);
});

it("reads clear denials", () => {
  // Production: this was said about Texas, where eleven bills had become law.
  assert.equal(
    found(extractBoolean("We do not have data on Texas bills that became law.")).value,
    false,
  );
  assert.equal(found(extractBoolean("No. That is not in the site's data.")).value, false);
  assert.equal(found(extractBoolean("None of them became law.")).value, false);
  assert.equal(found(extractBoolean("Zero bills from that member became law.")).value, false);
  assert.equal(found(extractBoolean("It has not been enacted.")).value, false);
});

it("reads a denial written with a typographic apostrophe", () => {
  // The production Texas denial, in the apostrophe a model actually emits. This
  // used to be unscored, so the harness would have missed the very defect it
  // was built for.
  assert.equal(
    found(extractBoolean("We don’t have data on Texas bills that became law.")).value,
    false,
  );
});

it("does not read 'zero have' as an affirmative count", () => {
  assert.equal(found(extractBoolean("Zero have become law.")).value, false);
});

it("refuses an answer that both denies and counts", () => {
  const reason = refused(
    extractBoolean("No, we do not track that. There are 11 Texas bills that became law."),
  ).reason;
  assert.ok(reason.includes("contradictory"), reason);
});

it("refuses when the answer says neither", () => {
  const reason = refused(extractBoolean("H.R. 6644 was introduced on 2025-11-20.")).reason;
  assert.ok(reason.includes("no yes/no"), reason);
});

it("a stage code in the explanation is vocabulary, not a rival claim", () => {
  // This exact sentence scored UNCHECKABLE against production: the stray 100
  // from "stage 100" looked like a second number and refused a correct answer.
  assert.deepEqual(
    extractNumber("104 measures in the 119th Congress have become law (stage 100, signed into law) as of today."),
    { found: true, value: 104 },
  );
});

it("a public law number is an identifier, not a count", () => {
  assert.deepEqual(
    extractNumber("Yes — 11 have, including H.R. 1, which became Public Law 119-21."),
    { found: true, value: 11 },
  );
});

it("still refuses when two real counts genuinely disagree", () => {
  // The guard that matters must survive the loosening above.
  const r = extractNumber("104 House bills became law. The party split is 56 and 8.");
  assert.equal(r.found, false);
});

if (failures.length > 0) {
  console.error(`scripts/truth/extract.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`scripts/truth/extract.test.ts — ${passed} passed`);
export {};
