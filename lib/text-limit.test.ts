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
  assert.deepEqual(limitText('farm bill', 120), { value: 'farm bill', overflowed: false });
  assert.deepEqual(limitText('a'.repeat(120), 120), { value: 'a'.repeat(120), overflowed: false });
});

it('cuts a paste or a keystroke past the limit, and says it did', () => {
  assert.deepEqual(limitText('a'.repeat(121), 120), { value: 'a'.repeat(120), overflowed: true });
  const pasted = 'How many bills about school lunch '.repeat(80);
  const r = limitText(pasted, 2000);
  assert.equal(r.value.length, 2000);
  assert.equal(r.overflowed, true);
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
