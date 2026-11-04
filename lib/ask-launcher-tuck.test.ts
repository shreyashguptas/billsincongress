/**
 * Tests for lib/ask-launcher-tuck.ts — when the Ask launcher steps aside.
 *
 * The reported bug: the launcher sat on top of whatever was in the
 * bottom-right corner (on a phone the Republicans' "filed" and "laws" counts on the home
 * page; on a small desktop the right-hand counters of a list) and never moved. Each case below is
 * a reader's scroll, written as the launcher state they should see.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import {
  INITIAL_TUCK,
  TUCK_DOWN_PX,
  TUCK_END_PX,
  TUCK_TOP_PX,
  TUCK_UP_PX,
  nextTuck,
  type TuckState,
} from './ask-launcher-tuck';

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`,
    );
  }
}

/** A long page: 6,000px of scroll. */
const MAX = 6000;

function scroll(ys: number[], from: TuckState = INITIAL_TUCK): TuckState {
  return ys.reduce((s, y) => nextTuck(s, y, MAX), from);
}

it('is shown when the page opens', () => {
  assert.equal(nextTuck(INITIAL_TUCK, 0, MAX).tucked, false);
});

it('tucks away once the reader scrolls down into the page', () => {
  assert.equal(scroll([0, 200, 400]).tucked, true);
});

it('tucks on a slow scroll, a few pixels a frame', () => {
  const start = TUCK_TOP_PX + 1;
  const ys = Array.from({ length: 10 }, (_, i) => start + i * 2);
  // 2px a frame never crosses a per-frame threshold; from the anchor it does.
  assert.equal(scroll(ys, { tucked: false, anchor: start }).tucked, true);
});

it('stays shown in the first screenful, before reading starts', () => {
  assert.equal(scroll([0, 40, TUCK_TOP_PX]).tucked, false);
});

it('comes back on a deliberate scroll up', () => {
  const down = scroll([0, 800, 1600]);
  assert.equal(nextTuck(down, 1600 - TUCK_UP_PX, MAX).tucked, false);
});

it('ignores the bounce at the end of a flick', () => {
  const down = scroll([0, 800, 1600]);
  assert.equal(nextTuck(down, 1600 - (TUCK_UP_PX - 1), MAX).tucked, true);
});

it('measures the scroll up from the furthest point reached', () => {
  // 1600 → 2400, then back 20: still tucked, though 2380 is far below 1600.
  const s = scroll([0, 800, 1600, 2400, 2380]);
  assert.equal(s.tucked, true);
  assert.equal(nextTuck(s, 2400 - TUCK_UP_PX, MAX).tucked, false);
});

it('tucks again on the next scroll down after coming back', () => {
  const back = scroll([0, 1600, 1500]);
  assert.equal(back.tucked, false);
  assert.equal(nextTuck(back, 1500 + TUCK_DOWN_PX, MAX).tucked, true);
});

it('returns near the end of the page, where the footer leaves it room', () => {
  assert.equal(scroll([0, 2000, MAX - TUCK_END_PX]).tucked, false);
  assert.equal(scroll([0, 2000, MAX]).tucked, false);
});

it('never tucks on a page too short to scroll past the top band', () => {
  const short = (y: number) => nextTuck(INITIAL_TUCK, y, 300).tucked;
  assert.equal(short(150), false);
  assert.equal(short(300), false);
});

it('treats iOS rubber-banding above the top as the top', () => {
  assert.equal(scroll([0, 2000, -40]).tucked, false);
});

console.log(`\nask-launcher-tuck: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
