/**
 * Tests for the session-replay text mask: a reader's email and name must not
 * reach PostHog recordings, and nothing else on the page should change.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRIVATE_BLOCK_CLASS, PRIVATE_TEXT_CLASS, maskReplayText } from "./replay-privacy";

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

// The mask only protects readers while it is wired in. Each of these is one
// line that a refactor could drop without any other test noticing.
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
// assert.match would print the whole file on failure; say which file and pattern instead.
function wires(path: string, pattern: RegExp) {
  assert.ok(pattern.test(source(path)), `${path} no longer matches ${pattern}`);
}

it("PostHog's init passes the text mask and the block selector to replay", () => {
  wires("instrumentation-client.ts", /maskTextSelector:\s*'\*'/);
  wires("instrumentation-client.ts", /maskTextFn:\s*maskReplayText/);
  wires("instrumentation-client.ts", /blockSelector:\s*`\.\$\{PRIVATE_BLOCK_CLASS\}`/);
});

it("the avatar, everywhere it appears, is blocked from replay", () => {
  wires("components/brand/pro-mark.tsx", /cn\(PRIVATE_BLOCK_CLASS,/);
  wires("components/account/avatar-editor.tsx", /cn\(\s*PRIVATE_BLOCK_CLASS,/);
});

it("the two places that print the reader's name mask it", () => {
  wires("components/auth/user-menu.tsx", /cn\(PRIVATE_TEXT_CLASS, "[^"]*"\)\}>\{displayName\}/);
  wires("app/account/account-view.tsx", /cn\(PRIVATE_TEXT_CLASS, "[^"]*"\)\}>\s*\{displayName\}/);
});

it("the block class is not one of PostHog's own, so clicks stay autocaptured", () => {
  assert.notEqual(PRIVATE_BLOCK_CLASS, "ph-no-capture");
});

if (failures.length) {
  console.error(`\nreplayPrivacy: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}
console.log(`replayPrivacy: all ${passed} tests passed`);
