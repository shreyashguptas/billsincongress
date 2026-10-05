/**
 * The answer prompt template. Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANSWER_PROMPT_NAME,
  DEFAULT_TEMPLATE,
  renderPrompt,
  validTemplate,
} from "./promptTemplate";
import { buildSystemPrompt } from "./tools";

let passed = 0;
const failures: string[] = [];
function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`  ✗ ${name}\n    ${err instanceof Error ? err.message : String(err)}`);
  }
}

const filled = { datasets: "DATASETS-HERE", calendar: "\n\nCAL", context: "\n\nCTX" };

it("the in-code default is a valid template that uses every slot", () => {
  assert.ok(validTemplate(DEFAULT_TEMPLATE));
  const out = renderPrompt(DEFAULT_TEMPLATE, filled);
  assert.ok(out.includes("DATASETS-HERE") && out.endsWith("\n\nCAL\n\nCTX"));
  assert.ok(!/\{\{/.test(out), "a slot reached the model unfilled");
});

it("rejects a template that would break answers", () => {
  assert.equal(validTemplate(undefined), false);
  assert.equal(validTemplate("short {{datasets}}"), false, "too short to be a real prompt");
  const long = "x".repeat(300);
  assert.equal(validTemplate(long), false, "no dataset slot: the model would not know what it can read");
  const all = "{{datasets}}{{calendar}}{{context}}";
  assert.equal(validTemplate(`${long} {{datasets}}{{context}}`), false, "no calendar: no date, ended Congresses called pending");
  assert.equal(validTemplate(`${long} {{datasets}}{{calendar}}`), false, "no context: the reader's bill is lost");
  assert.equal(validTemplate(`${long} ${all} {{reader_name}}`), false, "a slot nothing fills");
  assert.equal(validTemplate(`${long} {{ datasets }}{{calendar}}{{context}}`), true, "spaces inside the braces are fine");
});

// A bad edit in PostHog must never take answers down: it falls back to code.
it("buildSystemPrompt ignores an invalid template for the default", () => {
  const fallback = buildSystemPrompt({ today: "2026-10-05" });
  assert.equal(buildSystemPrompt({ today: "2026-10-05", template: "{{oops}}" }), fallback);
  const custom = `${"Custom wording. ".repeat(20)}\n{{datasets}}{{calendar}}{{context}}`;
  const out = buildSystemPrompt({ today: "2026-10-05", template: custom });
  assert.ok(out.startsWith("Custom wording."));
  assert.ok(out.includes("2026-10-05"), "the calendar slot was filled");
});

// Both found by comparing versions on real data, 2026-10-05.
it("sends 'summarize' to the official summary, and reads a count's total, not its empty rows", () => {
  assert.match(DEFAULT_TEMPLATE, /"summarize".*official summary in `bill_summaries`/);
  assert.match(DEFAULT_TEMPLATE, /Empty rows there are not "none"; read the total/);
  assert.match(DEFAULT_TEMPLATE, /a count has no rows, so it gets no cards/);
});

it("the browser looks for the same prompt name the server serves", () => {
  const source = readFileSync(new URL("../../lib/analytics.ts", import.meta.url), "utf8");
  assert.ok(source.includes(`const ANSWER_PROMPT_NAME = '${ANSWER_PROMPT_NAME}'`));
});

if (failures.length > 0) {
  console.error(`convex/catalog/promptTemplate.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`convex/catalog/promptTemplate.test.ts — ${passed} passed`);
export {};
