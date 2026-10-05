/**
 * The answer model's reasoning setting. Run with: `pnpm test`.
 */
import assert from "node:assert/strict";
import { ANSWER_MAX_TOKENS, REASONING_HEADROOM_TOKENS, reasoningConfig } from "./reasoning";

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

it("reasons at low effort when nothing is set", () => {
  assert.deepEqual(reasoningConfig(undefined), { effort: "low" });
  assert.deepEqual(reasoningConfig(""), { effort: "low" });
  assert.deepEqual(reasoningConfig("  "), { effort: "low" });
});

it("turns off with off, false or none, in any case", () => {
  for (const v of ["off", "OFF", "false", "none", " Off "]) assert.deepEqual(reasoningConfig(v), { enabled: false }, v);
});

it("passes any other value through as the effort", () => {
  assert.deepEqual(reasoningConfig("minimal"), { effort: "minimal" });
  assert.deepEqual(reasoningConfig("Medium"), { effort: "medium" });
});

it("leaves the answer its full budget on top of the reasoning", () => {
  assert.equal(ANSWER_MAX_TOKENS, 2048);
  assert.ok(REASONING_HEADROOM_TOKENS >= ANSWER_MAX_TOKENS);
});

if (failures.length > 0) {
  console.error(`convex/reasoning.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`convex/reasoning.test.ts — ${passed} passed`);
export {};
