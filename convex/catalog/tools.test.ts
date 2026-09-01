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
import { ANSWER_TOOLS, MAX_TOOL_ROUNDS, buildSystemPrompt } from "./tools";

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
  assert.ok(prompt.includes("The result is complete with a total of 54"));
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

it("survives being built without a date, rather than throwing", () => {
  // `today` is optional in the signature; a caller that forgets it should get a
  // weaker prompt, not a crashed answer.
  const bare = buildSystemPrompt({});
  assert.ok(bare.length > 0);
  assert.ok(!bare.includes(TODAY));
});

if (failures.length > 0) {
  console.error(`catalog/tools — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`catalog/tools — ${passed} passed`);
export {};
