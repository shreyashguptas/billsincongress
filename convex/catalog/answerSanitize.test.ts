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
import {
  INTERNAL_VOCABULARY,
  containsTextToolCall,
  dropQuestionEcho,
  isAllDeliberation,
  sanitizeAnswer,
  stripThinkingTags,
} from "./answerSanitize";

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

it("drops a dangling 'Let's look at…' after the answer, but never the facts around it", () => {
  // Until 2026-10-05 a mid-answer "Let's" sentence was always kept, for fear of
  // deleting prose. Removing only the SENTENCE keeps that promise: the fact
  // stays, and a reader is not left with a promise nothing below keeps.
  const dangling =
    "Sixty-four House bills became law in the 119th Congress.\n\n" +
    "Let's look at what they have in common.";
  assert.deepEqual(sanitizeAnswer(dangling), {
    text: "Sixty-four House bills became law in the 119th Congress.",
    removed: ["Let's look at what they have in common."],
  });
  // One transitional line between two paragraphs of answer is not a restart:
  // the headline fact above it must survive.
  const between =
    "Sixty-four House bills became law in the 119th Congress.\n\n" +
    "Let's look at what they have in common.\n\n" +
    "Most rename post offices or extend existing programs.";
  assert.equal(
    sanitizeAnswer(between).text,
    "Sixty-four House bills became law in the 119th Congress.\n\n" +
      "Most rename post offices or extend existing programs.",
  );
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

it("keeps the fact when the paragraph OPENS with the commonest narration", () => {
  // Found in review of the sentence-level trim itself: the paragraph-level check
  // ran first and matched on how the paragraph opens, so everything after the
  // opener went with it — including the answer. "Let me..." is the headline
  // example of the problem the trim exists to solve, and it was the one case the
  // trim never reached.
  const cases = [
    "Let me check that. The 119th Congress passed 104 laws so far.\n\nSee the breakdown below.",
    "Wait, that's the 118th. The 119th Congress passed 104 laws so far.\n\nSee the breakdown below.",
    "Actually, let me re-check. The 119th Congress passed 104 laws so far.\n\nSee below.",
  ];
  for (const c of cases) {
    const out = sanitizeAnswer(c).text;
    assert.ok(out.includes("104 laws so far"), `lost the fact: ${JSON.stringify(out)}`);
    assert.ok(!/^(let me|wait|actually)/i.test(out.trim()), `kept the narration: ${out}`);
  }
});

it("still drops a paragraph that is narration all the way through", () => {
  const r = sanitizeAnswer("Let me fetch the remaining policy areas.\n\n**Armed Forces:** 20");
  assert.equal(r.text, "**Armed Forces:** 20");
});

it("still catches working-out spread across otherwise-innocent sentences", () => {
  // Two or more process markers anywhere: what the paragraph-level rule catches
  // and the sentence matchers cannot. Moving it to a fallback must not lose it.
  const r = sanitizeAnswer(
    "The 119th has data. I need to confirm the stage codes. I should check the totals too.\n\n104 laws.",
  );
  assert.equal(r.text, "104 laws.");
});

it("keeps the fact when narration is joined to it by a colon", () => {
  // Raised in review: splitting only on . ! ? made "I need to check this and I
  // should confirm: 104 laws passed this session." one indivisible unit, so
  // trimming the narration took the fact with it.
  const r = sanitizeAnswer(
    "I need to check this and I should confirm: 104 laws passed this session.\n\nSee the breakdown below.",
  );
  assert.ok(r.text.includes("104 laws passed this session"), `lost the fact: ${r.text}`);
  assert.ok(!/i need to/i.test(r.text), `kept the narration: ${r.text}`);
});

it("does not treat every colon as a sentence break", () => {
  // A vote tally, a markdown label and a labelled fact all survive whole.
  for (const clean of [
    "The Senate passed it 51:50 on 2026-07-12.",
    "Note: 104 laws became law this Congress.",
    "**Health:** 1 law.\n\n**Energy:** 7 laws.",
  ]) {
    assert.equal(sanitizeAnswer(clean).text, clean, clean);
  }
});

// --- Lookups written as text (stability plan, 2026-10-02) --------------------
// The four shapes below are paraphrases of traced answers, not reader text.

it("recognises a fetch_dataset call written out as prose", () => {
  assert.equal(
    containsTextToolCall(
      "I'll count them.\nfetch_dataset(dataset=\"bills\", filters={\"congress\": 119}, limit=0)\n" +
        "So far 1,557 bills have been introduced in the 119th Congress.",
    ),
    true,
  );
  assert.equal(containsTextToolCall('describe_dataset("topics")'), true);
  assert.equal(containsTextToolCall("search_web (query: x)"), true);
});

it("recognises search_web's arguments written as query and reason lines", () => {
  assert.equal(
    containsTextToolCall(
      "about the farm bill\nquery: \"farm bill 2026 status\"\nreason: \"We do not hold news coverage.\"",
    ),
    true,
  );
});

it("recognises a run of describe_dataset JSON", () => {
  assert.equal(
    containsTextToolCall(
      '{"name":"topics","filters":{"congress":"number"},"short_description":"Bills per policy area"}\n' +
        '{"name":"stats","filters":{},"short_description":"Totals"}',
    ),
    true,
  );
});

it("leaves ordinary answers alone", () => {
  for (const clean of [
    "19,441 measures have been introduced in the 119th Congress.",
    "**H.R. 1** (Jodey Arrington) became law.",
    "The search for that query returned nothing.\n\nThe reason is that no bill uses the word.",
    "Query: none.",
    "Reason: the bill was referred to committee.",
    "The bill's name (H.R. 7027) is short for its subject.",
    "A JSON export is not something we offer.",
  ]) {
    assert.equal(containsTextToolCall(clean), false, clean);
  }
});

it("an echo must match whole words", () => {
  // "lawful under federal law" ends "unlawful under federal law" only mid-word.
  const answer = "lawful under federal law\nNo bill would make it unlawful.";
  assert.equal(
    dropQuestionEcho(answer, "Which bills make drone hunting unlawful under federal law?").text,
    answer,
  );
});

it("drops a first line that only repeats the end of the question", () => {
  const r = dropQuestionEcho(
    "bills about wildfire smoke this year\nThree bills about wildfire smoke were introduced in 2026.",
    "How many bills about wildfire smoke this year?",
  );
  assert.equal(r.text, "Three bills about wildfire smoke were introduced in 2026.");
  assert.deepEqual(r.removed, ["bills about wildfire smoke this year"]);
});

it("sanitizeAnswer applies the echo rule only when it is given the question", () => {
  const answer = "bills about wildfire smoke this year\nThree bills were introduced.";
  assert.equal(sanitizeAnswer(answer).text, answer);
  assert.equal(
    sanitizeAnswer(answer, "how many bills about wildfire smoke this year").text,
    "Three bills were introduced.",
  );
});

it("keeps a first line that answers a question ending in a statement", () => {
  const answer = "S. 629 became law.\nIt was signed on 2026-07-12.";
  assert.equal(dropQuestionEcho(answer, "Can you confirm S. 629 became law?").text, answer);
});

it("keeps first lines that are not an echo", () => {
  const question = "Which bill most recently became law?";
  for (const answer of [
    // Too short to call an echo.
    "became law\nS. 629 most recently became law.",
    // A real answer line that shares words but does not end the question.
    "S. 629 most recently became law.\nIt was signed on 2026-09-18.",
    // Nothing follows it: left for the caller, not blanked here.
    "most recently became law",
  ]) {
    assert.equal(dropQuestionEcho(answer, question).text, answer, answer);
  }
});

// --- Thinking out loud AFTER the answer started (2026-10-05) ---------------
//
// Verbatim from production, asked "how many bills about wildfire were
// introduced" from /bills. Every rule above looks only at the front of a reply,
// so all of it reached the reader. 76 is right: 76 measures in the 119th have
// "wildfire" in their title.
const WILDFIRE_LIVE =
  'The total is exact: 76 measures in the 119th Congress have "wildfire" in their title. But "wildfire" could appear in titles of bills that are about other things too. Let me also consider whether the reader means bills specifically about wildfire, not just mentioning it. The title search matches any bill whose title contains the word. Let me also check the Emergency Management policy area, which is where wildfire bills would most likely be categorized.\n\n' +
  'Actually, the title search is a reasonable proxy here. The question asks "how many bills about wildfire were introduced." The title search found 76 measures with "wildfire" in the title. That\'s a good answer. Let me state it.\n\n' +
  'In the 119th Congress, 76 measures introduced so far have "wildfire" in their title. That\'s a snapshot taken today (October 5, 2026), and the Congress is still in session until January 2027, so that number will grow as more bills are filed.\n\n' +
  'Note that this counts measures (bills plus resolutions), and it\'s a title search — so it captures bills whose titles mention wildfire, which is a good proxy for "about wildfire."';

it("publishes only the answer the model wrote after it finished thinking out loud", () => {
  const { text, removed } = sanitizeAnswer(WILDFIRE_LIVE, "how many bills about wildfire were introduced");
  assert.ok(text.startsWith("In the 119th Congress, 76 measures introduced so far"), text);
  for (const leak of ["Let me", "Actually,", "The question asks", "That's a good answer", "the reader means"]) {
    assert.ok(!text.includes(leak), `still shows: ${leak}`);
  }
  assert.ok(text.includes("76 measures"));
  assert.equal(removed.length >= 2, true);
});

it("drops 'The total is exact:' but keeps the fact it introduces", () => {
  assert.equal(
    sanitizeAnswer('The total is exact: 76 measures in the 119th Congress have "wildfire" in their title.').text,
    '76 measures in the 119th Congress have "wildfire" in their title.',
  );
});

it("drops a closing offer to help further", () => {
  assert.equal(
    sanitizeAnswer("Thirty-one health bills became law in the 118th Congress.\n\nLet me know if you want the full list.").text,
    "Thirty-one health bills became law in the 118th Congress.",
  );
});

it("keeps the cards from a discarded draft when the final answer has none", () => {
  const answer =
    "Two wildfire bills became law.\n\n[[bills:1234hr119,5678s119]]\n\n" +
    "Let me also check whether any passed the Senate. The question asks only about laws. Let me state it.\n\n" +
    "Two wildfire bills became law in the 119th Congress.";
  const { text } = sanitizeAnswer(answer);
  assert.equal(text, "Two wildfire bills became law in the 119th Congress.\n\n[[bills:1234hr119,5678s119]]");
});

it("never treats real answer sentences as thinking", () => {
  for (const answer of [
    "Actually, only 5 of those 76 became law.",
    "H.R. 5 passed the House in May 2025.\n\nActually, the Senate has not voted on it, so it is not law.",
    "Actually, none of them became law.",
    "The question is whether the Senate will act before January.",
    "H.R. 5 passed the House in May 2025.\n\nI should note that the Senate has not voted on it, so it is not law.",
    "The results show that 5 of them became law.",
    "Based on the data, 76 measures mention wildfire in their title.",
    "Let me note that five of them became law.",
    "Five wildfire bills passed the House.\n\nI will be brief: none of them became law.",
    "76 measures in the 119th Congress mention wildfire in their title.\n\nLet's start with the House, where 40 were introduced. Let's look at the Senate next, where 36 were.",
    "Let's look at the Senate, where forty were introduced.",
    "The Let Me Travel America Act was introduced in March. Let Me Travel America Act cosponsors are not tracked here.",
    "The user fees in the bill fund food-safety inspections.",
    "The Reader Privacy Act would limit what booksellers share.",
    "That's a snapshot taken today, and the count will grow while Congress is in session.",
    "I could not find any bill about that in the 119th Congress.",
  ]) {
    assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] }, answer);
  }
});

// Review findings on #166.
it("keeps the headline fact when an answer has several one-line transitions", () => {
  const answer =
    "Sixty-four House bills became law in the 119th Congress.\n\n" +
    "Let's look at what they have in common.\n\n" +
    "Most rename post offices or extend existing programs.\n\n" +
    "Let's look at who sponsored them.\n\n" +
    "Most were sponsored by Republicans.";
  assert.equal(
    sanitizeAnswer(answer).text,
    "Sixty-four House bills became law in the 119th Congress.\n\n" +
      "Most rename post offices or extend existing programs.\n\n" +
      "Most were sponsored by Republicans.",
  );
});

it("keeps the headline when the model continues after thinking instead of restarting", () => {
  // Review finding on 82b7a53: nothing checked that the text after the thinking
  // repeated the draft. Here it adds a new fact, so the first one must stay.
  const answer =
    "Sixty-four House bills became law in the 119th Congress.\n\n" +
    "Let me check the Senate side as well. Let me look at vetoes too.\n\n" +
    "Two bills were vetoed by the President.";
  assert.equal(
    sanitizeAnswer(answer).text,
    "Sixty-four House bills became law in the 119th Congress.\n\n" +
      "Two bills were vetoed by the President.",
  );
});

it("recognises a reply made only of the new thinking shapes as no answer", () => {
  assert.equal(isAllDeliberation("The question asks about wildfire. That's a good answer."), true);
  assert.equal(isAllDeliberation("Let me know if you want more."), true);
  assert.equal(isAllDeliberation("76 measures have wildfire in their title. That's a good answer."), false);
});

// --- Tagged thinking from the failover model (2026-10-05) -------------------
//
// amazon/nova-lite-v1 serves about 15% of production rounds when DeepSeek is
// unavailable, and writes its working in tags. Verbatim from that day:
it("removes a <thinking> block and keeps the answer after it", () => {
  const live =
    "<thinking>The fetch was complete, and the data shows the top 8 senators by the number of bills introduced. Rick Scott introduced the most bills with 182.</thinking> \n\n" +
    "The senator who introduced the most bills in the 119th Congress is Rick Scott from Florida, with 182.";
  assert.equal(
    sanitizeAnswer(live).text,
    "The senator who introduced the most bills in the 119th Congress is Rick Scott from Florida, with 182.",
  );
});

it("unwraps <response> and <answer> tags around an answer", () => {
  assert.equal(
    sanitizeAnswer("<response>Rick Scott introduced the most bills this Congress.</response>").text,
    "Rick Scott introduced the most bills this Congress.",
  );
  assert.equal(stripThinkingTags("<answer>Two bills became law.</answer>").text, "Two bills became law.");
});

it("treats a reply that is only a thinking block as no answer, and never empties it", () => {
  const only = "<thinking>I need to look up the sponsors first.</thinking>";
  assert.equal(isAllDeliberation(only), true);
  assert.deepEqual(stripThinkingTags(only), { text: only, removed: [] });
});

it("leaves text without tags alone, including a bill that mentions thinking", () => {
  const answer = "The Critical Thinking in Schools Act was introduced in March.";
  assert.deepEqual(sanitizeAnswer(answer), { text: answer, removed: [] });
  assert.equal(isAllDeliberation(answer), false);
});

it("never empties an answer that is all thinking", () => {
  const all = "Let me check the topics. Actually, let me look at the stages instead.";
  assert.deepEqual(sanitizeAnswer(all), { text: all, removed: [] });
});

// gpt-oss, 2026-10-05: "We don’t track co‑sponsor counts" and "became law on
// 2026‑09‑30", both with U+2011, which a reader's search box does not match.
it("turns look-alike hyphens and spaces into plain ones", () => {
  const raw = "We don\u2019t track co\u2011sponsor counts. It became law on 2026\u201109\u201130.\u202f[[cite:bills:1hr119]]";
  assert.deepEqual(sanitizeAnswer(raw), {
    text: "We don\u2019t track co-sponsor counts. It became law on 2026-09-30. [[cite:bills:1hr119]]",
    removed: [],
  });
});

it("turns gpt-oss's own citation bracket into ours", () => {
  assert.equal(
    sanitizeAnswer("It became law (S. 2393)\u3010cite:bills:2393s119]].").text,
    "It became law (S. 2393)[[cite:bills:2393s119]].",
  );
  assert.equal(
    sanitizeAnswer("See \u3010bills:2393s119\u3011").text,
    "See [[bills:2393s119]]",
  );
  // Not a marker: left as written.
  assert.equal(sanitizeAnswer("A \u3010note\u3011 here.").text, "A \u3010note\u3011 here.");
});

// Live, 2026-10-05: gpt-oss wrote the card as the row's handle, and the reader
// saw "[[sponsors:119:James Gallagher]]".
it("turns a card written as a row handle into the card syntax", () => {
  assert.equal(
    sanitizeAnswer("James Gallagher introduced the fewest. [[sponsors:119:James Gallagher]]").text,
    "James Gallagher introduced the fewest. [[sponsor:James Gallagher]]",
  );
  assert.equal(sanitizeAnswer("Health leads. [[topics:119:Health]]").text, "Health leads. [[topic:Health]]");
});

it("still finds thinking written with look-alike characters", () => {
  const raw = "Let me check the stage\u201140 count.\n\n72 laws started in the House.";
  assert.equal(sanitizeAnswer(raw).text, "72 laws started in the House.");
});

if (failures.length > 0) {
  console.error(`convex/catalog/answerSanitize.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`convex/catalog/answerSanitize.test.ts — ${passed} passed`);
export {};
