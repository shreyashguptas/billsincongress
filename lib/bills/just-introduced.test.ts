/**
 * "Just introduced" is a 30-day introduced-date window, not stage 20.
 *
 * The wrong answer a reader got: /bills?status=20 listed H.R. 2, 3, 5 … 19, all
 * reserved for party leaders on 3 Jan 2025, and /bills?policyArea=Health&status=20
 * said "No bills found" — 81 times in 30 days. Stage 20 is all but empty because
 * bills are sent to committee the day they are introduced.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import {
  JUST_INTRODUCED_STATUS,
  justIntroducedSince,
  stageAndIntroducedArgs,
} from './just-introduced';

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

it('turns status=20 into the last 30 days, with no stage', () => {
  assert.equal(JUST_INTRODUCED_STATUS, '20');
  assert.deepEqual(stageAndIntroducedArgs('20', 'all'), { introducedDateFilter: 'month' });
  assert.deepEqual(stageAndIntroducedArgs('20', undefined), { introducedDateFilter: 'month' });
});

it('keeps a narrower window the reader also chose, and replaces a wider one', () => {
  assert.deepEqual(stageAndIntroducedArgs('20', 'week'), { introducedDateFilter: 'week' });
  assert.deepEqual(stageAndIntroducedArgs('20', 'month'), { introducedDateFilter: 'month' });
  assert.deepEqual(stageAndIntroducedArgs('20', 'year'), { introducedDateFilter: 'month' });
});

it('leaves every other outcome a stage filter, exactly as before', () => {
  assert.deepEqual(stageAndIntroducedArgs('40', 'all'), { progressStage: 40 });
  assert.deepEqual(stageAndIntroducedArgs('100', 'year'), {
    progressStage: 100,
    introducedDateFilter: 'year',
  });
  assert.deepEqual(stageAndIntroducedArgs('all', 'all'), {});
  assert.deepEqual(stageAndIntroducedArgs(undefined, undefined), {});
  assert.deepEqual(stageAndIntroducedArgs('all', 'week'), { introducedDateFilter: 'week' });
});

it('computes the same first day as the list query', () => {
  // convex/bills.ts cutoffDateForFilter('month'): now minus 30 days, ISO date.
  assert.equal(justIntroducedSince(Date.parse('2026-10-16T12:00:00Z')), '2026-09-16');
  assert.equal(justIntroducedSince(Date.parse('2026-03-01T00:30:00Z')), '2026-01-30');
});

console.log(`\njust-introduced: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
