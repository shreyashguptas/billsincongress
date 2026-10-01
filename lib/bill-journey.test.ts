/**
 * Tests for the bill page's journey chapters, Congress clock and peer
 * headline (lib/bill-journey.ts). `today` is always pinned.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import {
  axisTicks,
  congressBounds,
  congressClock,
  finishOf,
  formatShare,
  journeyView,
  peerGroups,
  peerHeadline,
  type BillJourney,
} from './bill-journey';
import { BillStages } from './utils/bill-stages';

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

// H.R. 2483 (119th), the SUPPORT Act, as the stage calculator dates it.
const support: BillJourney = {
  steps: [
    { stage: BillStages.INTRODUCED, date: '2025-03-31' },
    { stage: BillStages.IN_COMMITTEE, date: '2025-03-31' },
    { stage: BillStages.PASSED_ONE_CHAMBER, date: '2025-06-04' },
    { stage: BillStages.PASSED_BOTH_CHAMBERS, date: '2025-09-18' },
    { stage: BillStages.TO_PRESIDENT, date: '2025-11-25' },
    { stage: BillStages.BECAME_LAW, date: '2025-12-01' },
  ],
  events: [
    { date: '2025-03-31', kind: 'introduced', label: 'Introduced' },
    { date: '2025-03-31', kind: 'referred', label: 'Sent to the Committee on Energy and Commerce and others' },
    { date: '2025-04-29', kind: 'committee_vote', label: 'A committee voted to send it to the floor', yeas: 36, nays: 13 },
    { date: '2025-06-04', kind: 'passed', chamber: 'house', label: 'Passed the House', yeas: 366, nays: 57 },
    { date: '2025-09-18', kind: 'passed', chamber: 'senate', label: 'Passed the Senate', how: 'unanimous consent' },
    { date: '2025-11-25', kind: 'to_president', label: 'Presented to the President' },
    { date: '2025-12-01', kind: 'signed', label: 'Signed by the President' },
    { date: '2025-12-01', kind: 'became_law', label: 'Became Public Law 119-44' },
  ],
  finalStage: BillStages.BECAME_LAW,
  actionCount: 51,
};

it('a law: one chapter per stage it spent time in, as long as it stayed', () => {
  const v = journeyView({ journey: support, billType: 'hr', congress: 119, today: '2026-09-30' });
  assert.equal(v.finish, 'law');
  assert.equal(v.totalDays, 245);
  assert.deepEqual(
    v.chapters.map((c) => [c.name, c.days]),
    [
      ['In committee', 65],
      ['Passed the House', 106],
      ['Passed both chambers', 68],
      ['On the President’s desk', 6],
    ],
  );
  // The same-day introduction folds into committee; the signing ends the last chapter.
  assert.deepEqual(v.chapters[0].events.map((e) => e.kind), ['introduced', 'referred', 'committee_vote']);
  assert.deepEqual(v.chapters[3].events.map((e) => e.kind), ['to_president', 'signed', 'became_law']);
  assert.ok(v.chapters.every((c) => !c.ongoing));
});

it('a bill still on its way counts to today, and says so', () => {
  const v = journeyView({
    journey: {
      steps: [
        { stage: BillStages.INTRODUCED, date: '2026-07-02' },
        { stage: BillStages.IN_COMMITTEE, date: '2026-07-02' },
      ],
      events: [{ date: '2026-07-02', kind: 'introduced', label: 'Introduced' }],
      finalStage: BillStages.IN_COMMITTEE,
      actionCount: 2,
    },
    billType: 'hr',
    congress: 119,
    today: '2026-09-30',
  });
  assert.equal(v.finish, null);
  assert.equal(v.expired, false);
  assert.equal(v.chapters.length, 1);
  assert.equal(v.chapters[0].days, 90);
  assert.equal(v.chapters[0].ongoing, true);
});

it('a bill left pending when its Congress ended expired that day', () => {
  const v = journeyView({
    journey: {
      steps: [
        { stage: BillStages.INTRODUCED, date: '2024-06-03' },
        { stage: BillStages.IN_COMMITTEE, date: '2024-06-03' },
      ],
      events: [],
      finalStage: BillStages.IN_COMMITTEE,
      actionCount: 2,
    },
    billType: 's',
    congress: 118,
    today: '2026-09-30',
  });
  assert.equal(v.expired, true);
  assert.equal(v.endDate, '2025-01-03');
  assert.equal(v.chapters[0].ongoing, false);
});

it('a simple resolution is finished when its own chamber adopts it', () => {
  assert.equal(finishOf(BillStages.PASSED_ONE_CHAMBER, 'hres'), 'adopted');
  assert.equal(finishOf(BillStages.PASSED_ONE_CHAMBER, 'hr'), null);
  assert.equal(finishOf(BillStages.PASSED_ONE_CHAMBER, 'sconres'), null);
  assert.equal(finishOf(BillStages.PASSED_BOTH_CHAMBERS, 'sconres'), 'adopted');
  assert.equal(finishOf(BillStages.VETOED, 'hjres'), 'vetoed');
});

it('the 119th Congress ends Jan 3, 2027, and the clock counts to it', () => {
  assert.deepEqual(congressBounds(119), { start: '2025-01-03', end: '2027-01-03' });
  const c = congressClock(119, '2026-09-30', '2026-09-29');
  assert.equal(c.daysLeft, 95);
  assert.equal(c.ended, false);
  assert.ok(Math.abs(c.introducedPct - 86.85) < 0.1);
});

it('axis ticks never crowd and always show both ends', () => {
  const ticks = axisTicks('2025-03-31', '2025-12-01');
  assert.equal(ticks[0].pct, 0);
  assert.equal(ticks[ticks.length - 1].pct, 100);
  for (let i = 1; i < ticks.length; i++) assert.ok(ticks[i].pct - ticks[i - 1].pct >= 9);
});

it('peer groups run in path order, vetoed after the President, empty ones dropped', () => {
  const groups = peerGroups([
    { stage: 100, count: 1 },
    { stage: 40, count: 2121 },
    { stage: 85, count: 0 },
    { stage: 20, count: 47 },
    { stage: 60, count: 12 },
  ]);
  assert.deepEqual(groups.map((g) => g.stage), [20, 40, 60, 100]);
});

it('a share too small to round says so instead of 0.0%', () => {
  assert.equal(formatShare(1, 2181), '<0.1%');
  assert.equal(formatShare(2121, 2181), '97.2%');
});

it('the headline states the finding about laws, in the tense of the Congress', () => {
  const base = { topic: 'Health', total: 2181, congress: 119, today: '2026-09-30' };
  assert.equal(
    peerHeadline({ ...base, lawCount: 1, billIsLaw: true }),
    'Of 2,181 Health bills and resolutions this Congress, this is the only one that became law.',
  );
  assert.equal(
    peerHeadline({ ...base, lawCount: 1, billIsLaw: false }),
    '1 of 2,181 Health bills and resolutions this Congress has become law.',
  );
  assert.equal(
    peerHeadline({ ...base, lawCount: 0, billIsLaw: false }),
    'None of the 2,181 Health bills and resolutions this Congress has become law yet.',
  );
  assert.equal(
    peerHeadline({ ...base, congress: 118, lawCount: 9, billIsLaw: false }),
    '9 of 2,181 Health bills and resolutions in the 118th Congress became law.',
  );
});

if (failures.length) {
  console.error(`bill-journey: ${failures.length} failed, ${passed} passed\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`bill-journey: ${passed} passed`);
