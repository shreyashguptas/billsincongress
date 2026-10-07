/**
 * The month-by-month sentence states only what the chart counts.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { cadenceNarration } from './monthly-cadence';

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

const m = (month: string, count: number, becameLaw = 0) => ({ month, count, becameLaw });

it('names the month whose bills produced the most laws, by filing month', () => {
  const n = cadenceNarration([m('2025-01', 900, 27), m('2025-12', 400, 3)], 119, new Date('2026-10-06'));
  assert.equal(n.lawPeak?.month, '2025-01');
  assert.equal(n.totalLaws, 30);
});

it('does not call the month in progress the quietest', () => {
  // Live on 2026-10-05: "Quietest: Oct ’26 (98)", five days into October.
  const n = cadenceNarration([m('2026-08', 300), m('2026-09', 700), m('2026-10', 98)], 119, new Date('2026-10-05'));
  assert.equal(n.quietest?.month, '2026-08');
});

it('does not call the final few days of a Congress the quietest month', () => {
  // The 117th ended on 3 Jan 2023; five measures were filed in those days.
  const n = cadenceNarration([m('2022-11', 116), m('2022-12', 233), m('2023-01', 5)], 117, new Date('2026-10-06'));
  assert.equal(n.quietest?.month, '2022-11');
});

it('still names the busiest month even when it is partial', () => {
  const n = cadenceNarration([m('2026-09', 100), m('2026-10', 900)], 119, new Date('2026-10-05'));
  assert.equal(n.peak?.month, '2026-10');
});

it('says nothing about laws when none became law', () => {
  const n = cadenceNarration([m('2025-01', 10)], 119, new Date('2025-02-01'));
  assert.equal(n.lawPeak, undefined);
  assert.equal(n.totalLaws, 0);
});

// Review on #172: in a Congress's first month nothing is full, and the old
// guard then hid the busiest month and the law total along with it.
it('names no quietest month before there are two full months to compare', () => {
  const first = cadenceNarration([m('2027-01', 300)], 120, new Date('2027-01-20'));
  assert.equal(first.peak?.month, '2027-01');
  assert.equal(first.quietest, undefined);
  const second = cadenceNarration([m('2027-01', 300), m('2027-02', 900)], 120, new Date('2027-02-10'));
  assert.equal(second.quietest, undefined, 'one full month cannot be both busiest and quietest');
});

console.log(`\nmonthly-cadence: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
