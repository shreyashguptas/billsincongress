/**
 * Tests for the session-replay text mask: a reader's email and name must not
 * reach PostHog recordings, and nothing else on the page should change.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { PRIVATE_TEXT_CLASS, maskReplayText } from "./replay-privacy";

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

// Just enough of an element for `closest`: the chain of class lists up to the root.
function element(...classLists: string[][]): HTMLElement {
  return {
    closest(selector: string) {
      const cls = selector.replace(/^\./, "");
      return classLists.some((list) => list.includes(cls)) ? ({} as Element) : null;
    },
  } as unknown as HTMLElement;
}

it("an email on its own is starred out, length kept", () => {
  assert.equal(maskReplayText("reader@example.com"), "******************");
});

it("an email inside a sentence is starred out and the sentence kept", () => {
  const address = "jane.doe+bills@mail.example.org";
  assert.equal(
    maskReplayText(`We sent a 6-digit code to ${address}.`),
    `We sent a 6-digit code to ${"*".repeat(address.length)}.`,
  );
});

it("text with no email is untouched", () => {
  const text = "H.R. 1234 passed the House on a 218–210 vote.";
  assert.equal(maskReplayText(text), text);
});

it("an @ that is not an address is untouched", () => {
  assert.equal(maskReplayText("Meet @ 5pm"), "Meet @ 5pm");
});

it("text inside a private element is starred out whole", () => {
  const el = element([PRIVATE_TEXT_CLASS], ["menu"]);
  assert.equal(maskReplayText("Jane Doe", el), "**** ***");
});

it("text outside a private element keeps everything but emails", () => {
  const el = element(["menu"]);
  assert.equal(maskReplayText("Free plan", el), "Free plan");
});

it("a missing element is handled", () => {
  assert.equal(maskReplayText("Free plan", undefined), "Free plan");
});

if (failures.length) {
  console.error(`\nreplayPrivacy: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`replayPrivacy: all ${passed} tests passed`);
