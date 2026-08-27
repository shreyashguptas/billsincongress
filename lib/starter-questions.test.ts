/**
 * Starter questions are generated from live dashboard numbers (spec §6.1).
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { starterQuestions } from './starter-questions';

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

const input = {
  congress: 119,
  totalBills: 19241,
  topPolicyAreas: [
    { name: 'Health', count: 2070 },
    { name: 'Taxation', count: 1204 },
  ],
  statusBreakdown: { introduced: 400, inCommittee: 16800, becameLaw: 38 },
};

it('returns exactly three starters', () => {
  assert.equal(starterQuestions(input).length, 3);
});

it('names the leading policy area', () => {
  assert.ok(starterQuestions(input).some((q) => q.toLowerCase().includes('health')));
});

it('formats large numbers with separators', () => {
  assert.ok(starterQuestions(input).some((q) => q.includes('2,070')));
});

it('still returns three starters when there is no data at all', () => {
  const out = starterQuestions({
    congress: 119,
    totalBills: 0,
    topPolicyAreas: [],
    statusBreakdown: null,
  });
  assert.equal(out.length, 3);
  assert.ok(out.every((q) => q.length > 0));
});

it('never emits a starter containing an undefined or NaN', () => {
  for (const q of starterQuestions(input)) {
    assert.ok(!q.includes('undefined'), q);
    assert.ok(!q.includes('NaN'), q);
  }
});

it('survives a policy area with a zero count', () => {
  const out = starterQuestions({ ...input, topPolicyAreas: [{ name: 'Health', count: 0 }] });
  assert.equal(out.length, 3);
  assert.ok(out.every((q) => !q.includes('0 health bills')));
});

it('returns three distinct starters', () => {
  const out = starterQuestions(input);
  assert.equal(new Set(out).size, 3);
});

console.log(`\nstarter-questions: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
