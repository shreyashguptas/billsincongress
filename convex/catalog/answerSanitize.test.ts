/**
 * Deliberation-stripping (defect D21).
 *
 * The three leaked paragraphs below are verbatim from production, not invented.
 * Each one shipped to a reader in the site's voice. The surviving answers are
 * grounded in the real corpus: 54 California members sponsored bills in the
 * 119th Congress and the fewest was James Gallagher with 5; H.R. 1 of the 119th
 * (Jodey Arrington, TX) became law.
 */
import assert from "node:assert/strict";
import { INTERNAL_VOCABULARY, isAllDeliberation, sanitizeAnswer } from "./answerSanitize";

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

const REAL_LEAK_FIELD_NAMES =
  "The dataset returned all 29 California members (total_matching: 29, truncated: false). " +
  "The member with the fewest bills is Tom McClintock with 25 bills.";
const REAL_LEAK_FALSE_ACCUSATION =
  "I want to be transparent about a limitation: our member-by-member count dataset only " +
  "captured Kevin Cramer's total, and our per-member records appear incomplete for Georgia.";
const REAL_LEAK_SELF_CHECK =
  "Let me confirm this is the most recent by checking the top of the list — yes, it's the first row.";

it("drops the leaked internal field names and keeps the real answer", () => {
  const answer =
    `${REAL_LEAK_FIELD_NAMES}\n\n` +
    "Fifty-four California members sponsored bills in the 119th Congress. James Gallagher " +
    "sponsored the fewest, with five.";
  const result = sanitizeAnswer(answer);
  assert.equal(
    result.text,
    "Fifty-four California members sponsored bills in the 119th Congress. James Gallagher " +
      "sponsored the fewest, with five.",
  );
  assert.ok(!result.text.includes("total_matching"));
  assert.ok(!result.text.includes("truncated"));
  assert.deepEqual(result.removed, [REAL_LEAK_FIELD_NAMES]);
});

it("drops the false accusation against our own data", () => {
  const answer =
    `${REAL_LEAK_FALSE_ACCUSATION}\n\n` +
    "Kevin Cramer of North Dakota sponsored 67 bills across the 117th, 118th and 119th Congresses.";
  const result = sanitizeAnswer(answer);
  assert.ok(!result.text.includes("appear incomplete"));
  assert.ok(!result.text.includes("transparent about a limitation"));
  assert.equal(
    result.text,
    "Kevin Cramer of North Dakota sponsored 67 bills across the 117th, 118th and 119th Congresses.",
  );
});

it("KNOWN GAP: a self-accusation with no internal vocabulary in it survives", () => {
  // The rules catch this paragraph only because it says "dataset". Stripped of
  // that word it reads as ordinary prose and gets published. Catching "our
  // records appear incomplete" needs its own rule; a blunt one would also delete
  // the honest caveats the prompt asks for ("we don't track co-sponsors").
  // Asserted so the hole is visible rather than assumed closed.
  const answer = "Our per-member records appear incomplete for Georgia.";
  assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] });
});

it("drops the leading self-check narration", () => {
  const answer =
    `${REAL_LEAK_SELF_CHECK}\n\n` +
    "The most recent action on H.R. 1 was on 4 July 2025, when it became law.";
  const result = sanitizeAnswer(answer);
  assert.equal(result.text, "The most recent action on H.R. 1 was on 4 July 2025, when it became law.");
  assert.deepEqual(result.removed, [REAL_LEAK_SELF_CHECK]);
});

it("leaves an honest 'I could not find' answer untouched", () => {
  // Rule 3: a first-person pronoun is not narration. This is the answer.
  const answer =
    "I could not find any Texas bills matching that description.\n\n" +
    "Try a broader search, or ask about a specific bill number.";
  assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] });
});

it("returns an all-deliberation answer unchanged rather than nothing", () => {
  // The guard against mangling. A leaky answer beats an empty one.
  const answer = `${REAL_LEAK_SELF_CHECK}\n\n${REAL_LEAK_FIELD_NAMES}`;
  const result = sanitizeAnswer(answer);
  assert.equal(result.text, answer);
  assert.deepEqual(result.removed, []);
});

it("preserves markdown, lists and [[...]] directives byte for byte", () => {
  const answer =
    "**H.R. 1** became law on 4 July 2025.\n\n" +
    "- Sponsored by Jodey Arrington (R-TX)\n" +
    "- Introduced 2025-02-21\n\n" +
    "[[bills:1hr119]]\n\n" +
    "Its progress is recorded as enacted [[cite:bills:1hr119]].";
  assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] });
});

it("strips leading deliberation without touching the markdown behind it", () => {
  const answer =
    `${REAL_LEAK_SELF_CHECK}\n\n` +
    "**H.R. 1** became law on 4 July 2025.\n\n" +
    "- Sponsored by Jodey Arrington (R-TX)\n" +
    "- Introduced 2025-02-21\n\n" +
    "[[bills:1hr119]]";
  const result = sanitizeAnswer(answer);
  assert.equal(
    result.text,
    "**H.R. 1** became law on 4 July 2025.\n\n" +
      "- Sponsored by Jodey Arrington (R-TX)\n" +
      "- Introduced 2025-02-21\n\n" +
      "[[bills:1hr119]]",
  );
});

it("does not match 'truncated' inside 'untruncated'", () => {
  const answer = "The untruncated title runs to eleven words.";
  assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] });
});

it("does not match a vocabulary word inside a longer word", () => {
  for (const answer of ["Redataset spending rose.", "The waiting period is 30 days."]) {
    assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] });
  }
});

it("catches the plural forms the singular term would miss", () => {
  const answer =
    "The bill covers three areas.\n\n" +
    "Our datasets do not hold vote tallies, and the tool calls returned nothing.\n\n" +
    "It was introduced in February 2025.";
  const result = sanitizeAnswer(answer);
  assert.equal(result.text, "The bill covers three areas.\n\nIt was introduced in February 2025.");
  assert.equal(result.removed.length, 1);
});

it("drops a leaky paragraph in the middle of an answer, not just at the top", () => {
  const answer =
    "H.R. 1 became law on 4 July 2025.\n\n" +
    "Its progressStage is 100, which is the enacted code.\n\n" +
    "It was sponsored by Jodey Arrington of Texas.";
  const result = sanitizeAnswer(answer);
  assert.equal(
    result.text,
    "H.R. 1 became law on 4 July 2025.\n\nIt was sponsored by Jodey Arrington of Texas.",
  );
  assert.deepEqual(result.removed, ["Its progressStage is 100, which is the enacted code."]);
});

it("drops a whole leading run of deliberation", () => {
  const answer =
    "Let's start with the House.\n\n" +
    "I need to check which Congress the reader means.\n\n" +
    "Wait — the question says the 119th.\n\n" +
    "Sixty-four House bills became law in the 119th Congress.";
  const result = sanitizeAnswer(answer);
  assert.equal(result.text, "Sixty-four House bills became law in the 119th Congress.");
  assert.equal(result.removed.length, 3);
});

it("keeps deliberation-shaped narration once the answer has started", () => {
  // Rule 1 is leading-only on purpose: dropping mid-answer paragraphs risks
  // deleting prose that merely opens with a stray "Let's".
  const answer =
    "Sixty-four House bills became law in the 119th Congress.\n\n" +
    "Let's look at what they have in common.";
  assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] });
});

it("does not read ordinary legislative prose as a process marker", () => {
  // Regression: the markers were matched as bare substrings, so each of these
  // opening sentences was deleted as narration. "let members" contains "let me",
  // "Hawaii/Missouri/Mississippi should" contains "i should" (1,776 bills in the
  // corpus are sponsored from those three states), "outlet's" contains "let's".
  // Deleting the answer is the same defect as publishing the narration.
  const openings = [
    "The bill would let members of the public comment on the rule.",
    "It would let medical providers bill Medicare directly.",
    "Hawaii should receive the largest share under the formula.",
    "Missouri should be listed among the eligible states.",
    "Mississippi should see the biggest change.",
    "The outlet's coverage of the bill was thin.",
  ];
  for (const opening of openings) {
    const answer = `${opening}\n\nIt was introduced in February 2025.`;
    assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] }, opening);
  }
});

it("keeps 'Wait times' but still drops 'Wait —' deliberation", () => {
  // Regression: "wait" as a bare opener deleted the first paragraph of any
  // answer about the Stop the Wait Act or military health care wait times —
  // 14 real bill titles and 87 summaries in the corpus are about wait times.
  const answer = "Wait times at the VA averaged 120 days in 2025.\n\nH.R. 1 does not address them.";
  assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] });

  for (const narration of ["Wait — the question says the 119th.", "Wait, that is the 118th."]) {
    const leaky = `${narration}\n\nSixty-four House bills became law in the 119th Congress.`;
    const result = sanitizeAnswer(leaky);
    assert.equal(result.text, "Sixty-four House bills became law in the 119th Congress.", narration);
    assert.deepEqual(result.removed, [narration]);
  }
});

it("keeps the exact blank-line separation of what survives", () => {
  const answer = `${REAL_LEAK_SELF_CHECK}\n\n\nFirst paragraph.\n\n\n\nSecond paragraph.`;
  const result = sanitizeAnswer(answer);
  assert.equal(result.text, "First paragraph.\n\n\n\nSecond paragraph.");
});

it("handles empty and whitespace-only input", () => {
  assert.deepEqual(sanitizeAnswer(""), { text: "", removed: [] });
  assert.deepEqual(sanitizeAnswer("\n\n  \n"), { text: "\n\n  \n", removed: [] });
});

it("publishes the vocabulary it enforces", () => {
  for (const term of ["total_matching", "countIsLowerBound", "_cite", "scan window", "limit 50"]) {
    assert.ok(INTERNAL_VOCABULARY.includes(term), `${term} missing from INTERNAL_VOCABULARY`);
  }
  for (const term of INTERNAL_VOCABULARY) {
    const answer = `The count came back with ${term} attached.\n\nThe bill is still in committee.`;
    const result = sanitizeAnswer(answer);
    assert.equal(result.text, "The bill is still in committee.", `${term} was not caught`);
  }
});

it("recognises an answer that is nothing but the model thinking out loud", () => {
  // Production shipped this to a reader as the answer to "how many laws in each
  // category". sanitizeAnswer deliberately returns it unchanged rather than
  // emptying it, so the caller needs a way to tell it apart from a real answer.
  assert.equal(
    isAllDeliberation("Let me fetch the remaining policy areas I haven't gotten yet."),
    true,
  );
  assert.equal(isAllDeliberation("Let me check that.\n\nThe result says truncated: false."), true);
});

it("a leaky but CORRECT answer is kept, not thrown away", () => {
  // Production returned this. It quotes an internal field name, which is a wording
  // defect — and it is also the right number. Discarding it would cost the reader
  // a correct answer to protect them from a word.
  assert.equal(
    isAllDeliberation(
      "The House-only row shows 64 measures that became law, and partyLawCounts sums to 64 (8+56).",
    ),
    false,
  );
});

it("does not mistake an honest admission for deliberation", () => {
  // "I could not find that" is a real answer and must survive.
  assert.equal(isAllDeliberation("I could not find any Texas bills that became law."), false);
  assert.equal(isAllDeliberation("We do not track co-sponsors."), false);
  assert.equal(
    isAllDeliberation("**H.R. 1** is the reconciliation act, sponsored by Jodey Arrington."),
    false,
  );
});

it("an empty string is not deliberation", () => {
  assert.equal(isAllDeliberation(""), false);
  assert.equal(isAllDeliberation("   \n\n  "), false);
});

it("trims narration that opens a paragraph the answer shares", () => {
  // Measured against production: three answers in four to the laws-by-category
  // question opened this way, and in this shape the narration and the answer are
  // the SAME paragraph — dropping it would take the answer with it.
  assert.equal(
    sanitizeAnswer("I have everything I need. The 119th Congress has 104 laws passed so far.").text,
    "The 119th Congress has 104 laws passed so far.",
  );
  assert.equal(
    sanitizeAnswer(
      "I have the complete breakdown. Let me present this to the reader.\n\nThe 119th passed 104 laws.",
    ).text,
    "The 119th passed 104 laws.",
  );
});

it("drops a whole opening paragraph of narration when the answer follows", () => {
  const r = sanitizeAnswer(
    "I have a complete breakdown of all 104 laws passed in the 119th Congress by policy area.\n\n**Armed Forces:** 20",
  );
  assert.equal(r.text, "**Armed Forces:** 20");
  assert.equal(r.removed.length, 1);
});

it("never mistakes an honest 'I have no...' for narration", () => {
  // The one shape that must survive: it is an answer, not working-out.
  for (const honest of [
    "I have no record of that bill.",
    "I have not found anything on that.",
    "I haven't got a summary for it.",
  ]) {
    assert.equal(sanitizeAnswer(honest).text, honest, honest);
  }
});

it("leaves a clean opening alone", () => {
  for (const clean of [
    "Here's the breakdown of the 104 laws passed in the 119th Congress.",
    "The 119th Congress has passed 104 laws so far.",
    "Let me Be Frank Act is a real bill title and must not be eaten.",
  ]) {
    assert.equal(sanitizeAnswer(clean).text, clean, clean);
  }
});

it("never eats a paragraph that names a real bill", () => {
  // Six titles in the corpus open with a phrase the narration matchers hit:
  // "Let Me Travel America Act", "Let's Get to Work Act of 2022". Before the
  // guard, an answer whose paragraph began with one was classed as working-out
  // and dropped whole — deleting the answer instead of the narration.
  const withTitle =
    "Let Me Travel America Act was introduced in March.\n\nIt is still in committee.";
  assert.equal(sanitizeAnswer(withTitle).text, withTitle);
  const other = "Let's Get to Work Act of 2022 cleared the House. It now goes to the Senate.";
  assert.equal(sanitizeAnswer(other).text, other);
});

if (failures.length > 0) {
  console.error(`convex/catalog/answerSanitize.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`convex/catalog/answerSanitize.test.ts — ${passed} passed`);
export {};
