/**
 * The system prompt.
 *
 * The prompt is the only thing standing between the reader and a model that will
 * happily narrate its own plumbing, and it had no test at all — so every rule in
 * it could be weakened or lost in a refactor without anything going red.
 *
 * These assert the rules that were added because production broke them, each
 * quoted from a real answer. A rule with a receipt is worth keeping; the rest of
 * the prompt is prose and is deliberately not pinned word for word.
 *
 * Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { calendarBlock, ANSWER_TOOLS, MAX_TOOL_ROUNDS, PRIMED_DATASETS, buildSystemPrompt, primedDescriptions } from "./tools";
import { describeDataset } from "./datasets";

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

const TODAY = "2026-08-31";
const VARS = { congress: 119, today: TODAY };
const prompt = buildSystemPrompt({ today: TODAY });

it("forbids opening by describing the result rather than Congress", () => {
  // Measured against production: "The result is complete with a total of 54
  // California members, and it's sorted fewest-first." twice out of two. The
  // sanitiser cannot fix this one — that sentence CARRIES the fact, so deleting
  // it would cost the reader a true statement. It has to be a prompt rule.
  assert.match(prompt, /never open by describing the RESULT/i);
  assert.match(prompt, /never say a result is complete, exact or sorted/i);
});

it("keeps the real offending openings in the prompt as examples", () => {
  // A rule the model has already broken is worth showing it, verbatim.
  assert.ok(prompt.includes("The result is complete, and it's sorted fewest-first."));
  assert.ok(prompt.includes("The count is exact"));
  assert.ok(prompt.includes("The top row shows"));
});

it("bans the contract's own vocabulary from reaching the reader", () => {
  for (const word of ["complete", "total", "order", "dataset", "rows", "fetch"]) {
    assert.ok(
      prompt.includes(`"${word}"`),
      `the voice rule no longer names ${word} as plumbing`,
    );
  }
});

it("states the set-level rule that the whole contract rests on", () => {
  // Counts, superlatives and "none" may only come from a complete result. This
  // is the sentence that stops "104 House bills became law" (it is 64).
  assert.match(prompt, /complete: true/);
  assert.match(prompt, /order: "arbitrary"/);
  assert.match(prompt, /never count the rows in front of you/i);
});

it("tells the model today's date, and that closed Congresses are over", () => {
  // Without this it dated "recent" from its training cutoff and described 37,000
  // bills from adjourned Congresses in the present tense.
  assert.ok(prompt.includes(TODAY), "today's date is missing from the prompt");
  assert.match(prompt, /past tense/i);
});

it("puts a caveat in the same sentence as the claim it limits", () => {
  // max_tokens truncation eats a closing paragraph, and the closing paragraph is
  // where the qualification used to live.
  assert.match(prompt, /SAME sentence as the claim it limits/i);
});

it("offers the reader-question tool and says when to reach for it", () => {
  const names = ANSWER_TOOLS.map((t) => t.function.name);
  assert.ok(names.includes("ask_reader"), "ask_reader is not offered");
  assert.match(prompt, /ask_reader/);
  assert.ok(MAX_TOOL_ROUNDS >= 1);
});

// 2026-09-24: 41% of home answers used every lookup round. Traces of real
// reader questions showed the first round always went on describe_dataset for
// bills and topics. That exchange is now primed before the question.
it("primes bills and topics with their real descriptions, as matched call/result pairs", () => {
  assert.deepEqual([...PRIMED_DATASETS], ["bills", "topics"]);
  const { toolCalls, results } = primedDescriptions(VARS);
  assert.equal(toolCalls.length, results.length);
  toolCalls.forEach((call, i) => {
    assert.equal(call.function.name, "describe_dataset");
    const { name } = JSON.parse(call.function.arguments);
    assert.equal(results[i].tool_call_id, call.id);
    assert.equal(results[i].content, describeDataset(name, VARS));
  });
  // Every call id must be unique, or a provider rejects the transcript.
  assert.equal(new Set(toolCalls.map((c) => c.id)).size, toolCalls.length);
});

it("tells the model not to spend a round re-describing what it was already given", () => {
  assert.match(prompt, /`bills` and `topics` are already described/);
  assert.match(prompt, /do not call\s+describe_dataset for them again/);
});

// Review of #115: the primed topics list is ONE Congress. Told only "do not
// fetch it again", a question about the 117th could be answered from the 119th's
// complete, cited list. The exception has to be in the rule itself.
it("tells the model to fetch topics itself for a different Congress than the primed one", () => {
  assert.match(prompt, /fetch `topics` yourself if the question\s+is about a different Congress/);
});

it("survives being built without a date, rather than throwing", () => {
  // `today` is optional in the signature; a caller that forgets it should get a
  // weaker prompt, not a crashed answer.
  const bare = buildSystemPrompt({});
  assert.ok(bare.length > 0);
  assert.ok(!bare.includes(TODAY));
});

it("asks for short answers that lead with the answer and stop", () => {
  // The owner's rule, 2026-10-05: answer exactly what was asked, short and
  // linked. The old "two to four short paragraphs" invited a closing paragraph
  // of caveats every time.
  assert.match(prompt, /answer in the first sentence/i);
  assert.match(prompt, /one to three sentences/i);
  assert.match(prompt, /no closing paragraph/i);
  assert.ok(!/two to four short paragraphs/i.test(prompt), "the old length rule is back");
});

it("tells the model to write the answer once, not a draft it then reconsiders", () => {
  // Production, 2026-10-05: a draft, two paragraphs of "Actually… the question
  // asks… Let me state it.", then the answer again. The sanitiser now cuts that;
  // this is the request not to write it at all.
  assert.match(prompt, /write the answer once/i);
  for (const tell of ["Actually…", "The question asks…", "the reader means…"]) {
    assert.ok(prompt.includes(tell), `the prompt no longer names ${tell}`);
  }
});

it("claims no missing summary or action without having looked", () => {
  // The fact-check judge, 2026-10-23 to 11-01: "There is no official summary
  // yet" with no bill_summaries lookup in the trace, and "its only recorded
  // action was its introduction" read off a row's two dates. The old rule
  // itself said to "say there is no official summary yet" whenever one was
  // not in hand.
  assert.match(prompt, /no official summary only after `bill_summaries` came back empty/);
  assert.match(prompt, /only from `bill_actions`: a row's dates do not show them/);
});

it("adds nothing the lookups did not give", () => {
  // Same judge: "supporters would likely say…", "Name changes are usually a
  // separate court process", "Most are post office namings" from 10 of 29.
  assert.match(prompt, /Add nothing of your own/);
  assert.match(prompt, /supporters would say/);
});

it("takes a ranking from a sorted result, never from counting positions", () => {
  // Same judge: "the fourth-largest policy area" for the sixth, and a list of
  // eight states "in order" that was not in order.
  assert.match(prompt, /Never count positions yourself/);
});

it("names a speaker only when the web excerpt does", () => {
  // Same judge: unattributed quotes in news excerpts put in the sponsor's mouth.
  assert.match(prompt, /Name who said something only if the excerpt names them/);
});

it("gives one way to count bills, not the old two-count workaround", () => {
  // The prompt said to add billType 'hr' and 's' as two counts, written a day
  // before measure 'bill' existed; the bills and stats docs said otherwise.
  assert.doesNotMatch(prompt, /two counts/);
  assert.match(prompt, /add measure 'bill'/);
});

it("allows the web lookup on the same condition in the tool and the prompt", () => {
  const web = ANSWER_TOOLS.find((t) => t.function.name === "search_web");
  assert.match(web!.function.description, /complete fetch_dataset came back empty/);
  assert.match(prompt, /complete lookup comes back empty/);
});

it("names the newest Congress we hold, from the data, not a constant", () => {
  const p120 = buildSystemPrompt({ today: "2027-03-01", newestCongress: 120 });
  assert.match(p120, /Congresses before the 120th have all adjourned/);
  assert.doesNotMatch(p120, /119th have all adjourned/);
});

it("says when a new Congress has convened that we hold no bills for yet", () => {
  // 3 January 2027: the 120th sits, the sync has not pulled a bill from it, and
  // the newest Congress we hold is the 119th, which just ended.
  const block = calendarBlock("2027-01-03", 119);
  assert.match(block, /119th Congress adjourned sine die on 2027-01-03/);
  assert.match(block, /The 120th Congress convened on 2027-01-03, and we hold none of its bills yet/);
  assert.doesNotMatch(calendarBlock("2026-10-14", 119), /hold none of its bills/);
});

it("prints ordinals, not '121th'", () => {
  assert.match(calendarBlock("2029-02-01", 121), /before the 121st have all adjourned/);
});

if (failures.length > 0) {
  console.error(`catalog/tools — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`catalog/tools — ${passed} passed`);
export {};
