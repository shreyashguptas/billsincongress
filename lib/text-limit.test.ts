/**
 * Text boxes with a length limit. Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { limitCount, limitMessage, limitState, limitText } from './text-limit';

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

it('keeps text at or under the limit as typed', () => {
  assert.deepEqual(limitText('farm bil', 'farm bill', 120), { value: 'farm bill', overflowed: false, caret: 9 });
  assert.equal(limitText('a'.repeat(119), 'a'.repeat(120), 120).overflowed, false);
});

it('cuts a paste past the limit to what fits, and says it did', () => {
  const pasted = 'How many bills about school lunch '.repeat(80);
  const r = limitText('', pasted, 2000);
  assert.equal(r.value, pasted.slice(0, 2000));
  assert.equal(r.overflowed, true);
  assert.equal(r.caret, 2000);
});

// Review finding on #143: cutting the TAIL deleted the reader's own last
// characters whenever they edited anywhere but the end of a full box.
it('refuses a keystroke into a full box without touching the text already there', () => {
  const full = 'abcdefghij'.repeat(12); // 120
  const typedAtTen = full.slice(0, 10) + 'X' + full.slice(10);
  assert.deepEqual(limitText(full, typedAtTen, 120), { value: full, overflowed: true, caret: 10 });
  assert.deepEqual(limitText(full, full + 'X', 120), { value: full, overflowed: true, caret: 120 });
});

it('keeps as much of a paste into the middle as fits, and the text around it', () => {
  const prev = 'a'.repeat(50) + 'z'.repeat(50); // 100
  const next = 'a'.repeat(50) + 'PASTED-TEXT-THAT-IS-TOO-LONG' + 'z'.repeat(50);
  const r = limitText(prev, next, 110);
  assert.equal(r.value, 'a'.repeat(50) + 'PASTED-TEX' + 'z'.repeat(50));
  assert.equal(r.caret, 60);
});

it('handles a paste that replaces a selection', () => {
  const prev = 'keep ' + 'old'.repeat(30) + ' end'; // 99
  const next = 'keep ' + 'N'.repeat(200) + ' end';
  const r = limitText(prev, next, 100);
  assert.equal(r.value, 'keep ' + 'N'.repeat(91) + ' end');
  assert.equal(r.value.length, 100);
  assert.equal(r.caret, 96);
});

it('stays quiet until 90% of the limit, counts after, and is full at the limit', () => {
  assert.equal(limitState(0, 120), 'quiet');
  assert.equal(limitState(107, 120), 'quiet');
  assert.equal(limitState(108, 120), 'near');
  assert.equal(limitState(119, 120), 'near');
  assert.equal(limitState(120, 120), 'full');
  assert.equal(limitState(1799, 2000), 'quiet');
  assert.equal(limitState(1800, 2000), 'near');
});

it('writes the count and the limit the way the site writes numbers', () => {
  assert.equal(limitCount(1850, 2000), '1,850 / 2,000');
  assert.equal(limitMessage(2000), 'Keep it to 2,000 characters.');
  assert.equal(limitMessage(120), 'Keep it to 120 characters.');
});

if (failures.length > 0) {
  console.error(`lib/text-limit.test.ts — ${passed} passed, ${failures.length} failed`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`lib/text-limit.test.ts — ${passed} passed`);
export {};
