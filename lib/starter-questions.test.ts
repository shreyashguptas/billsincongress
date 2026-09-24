/**
 * Starter questions are generated from live dashboard numbers (spec §6.1).
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { starters } from './starter-questions';

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

const texts = (i: Parameters<typeof starters>[0]) => starters(i).map((s) => s.text);

it('returns exactly three starters', () => {
  assert.equal(starters(input).length, 3);
});

it('names the leading policy area', () => {
  assert.ok(texts(input).some((q) => q.toLowerCase().includes('health')));
});

it('formats large numbers with separators', () => {
  assert.ok(texts(input).some((q) => q.includes('2,070')));
});

it('still returns three starters when there is no data at all', () => {
  const out = starters({
    congress: 119,
    totalBills: 0,
    topPolicyAreas: [],
    statusBreakdown: null,
  });
  assert.equal(out.length, 3);
  assert.ok(out.every((s) => s.text.length > 0));
});

it('never emits a starter containing an undefined or NaN', () => {
  for (const s of starters(input)) {
    assert.ok(!s.text.includes('undefined'), s.text);
    assert.ok(!s.text.includes('NaN'), s.text);
    assert.ok(!(s.href ?? '').includes('undefined'), s.href);
  }
});

it('returns three distinct starters', () => {
  assert.equal(new Set(texts(input)).size, 3);
});

// From 2 to 24 Sep 2026 the three data starters were asked of the answer engine
// 96 times; 27 readers left before an answer and 63 of 69 answers stopped
// early. Each now links to the page that answers it completely.
it('links every data starter instead of asking it', () => {
  for (const s of starters(input)) {
    assert.notEqual(s.kind, 'fallback', s.text);
    assert.ok(s.href?.startsWith('/bills'), `${s.text} -> ${s.href}`);
  }
});

it('sends the newest Congress to the hub pages', () => {
  const byKind = Object.fromEntries(
    starters({ ...input, latestCongress: 119 }).map((s) => [s.kind, s.href]),
  );
  assert.equal(byKind.became_law, '/bills/enacted');
  assert.equal(byKind.top_topic, '/bills/topic/health');
  assert.equal(byKind.in_committee, '/bills/in-committee');
});

// Hub pages always show the newest Congress, so a reader looking at the 117th
// must not be sent to a page of 119th bills.
it('sends an older Congress to the same filter on /bills, not to a hub', () => {
  const byKind = Object.fromEntries(
    starters({ ...input, congress: 117, latestCongress: 119 }).map((s) => [s.kind, s.href]),
  );
  assert.equal(byKind.became_law, '/bills?congress=117&status=100');
  assert.equal(byKind.top_topic, '/bills?congress=117&policyArea=Health');
  assert.equal(byKind.in_committee, '/bills?congress=117&status=40');
});

// The in-committee hub explains why bills stall; a filtered list does not, so
// only the hub link may promise a "why".
it('promises an explanation only when the destination has one', () => {
  const latest = starters({ ...input, latestCongress: 119 }).find((s) => s.kind === 'in_committee');
  const older = starters({ ...input, congress: 117, latestCongress: 119 }).find(
    (s) => s.kind === 'in_committee',
  );
  assert.ok(latest?.text.startsWith('Why'), latest?.text);
  assert.ok(!older?.text.startsWith('Why'), older?.text);
});

it('falls back to /bills when the newest Congress is unknown', () => {
  for (const s of starters({ ...input, latestCongress: null })) {
    assert.ok(s.href?.startsWith('/bills?congress=119'), s.href);
  }
});

it('falls back to /bills for a topic with no hub page', () => {
  const out = starters({
    ...input,
    latestCongress: 119,
    topPolicyAreas: [{ name: 'Not A Real Policy Area', count: 5 }],
  });
  const topic = out.find((s) => s.kind === 'top_topic');
  assert.equal(topic?.href, '/bills?congress=119&policyArea=Not+A+Real+Policy+Area');
});

it('asks the cold-start fallbacks rather than linking them', () => {
  const out = starters({ congress: 119, totalBills: 0, topPolicyAreas: [], statusBreakdown: null });
  assert.ok(out.every((s) => s.kind === 'fallback' && s.href === undefined));
});

console.log(`\nstarter-questions: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
