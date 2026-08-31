/**
 * Turning provenance handles into the printed source apparatus (spec §7.2).
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { printedSources, toSource, toSources, type WebSource } from './answer-format';
import { CompactStageLabel, compactStageLabel } from './utils/bill-stages';
// The prose numbering these tests must agree with, and the stage codes the
// labels must cover, are imported from their own sources on purpose: a copy of
// either here would let the real thing drift and still pass.
import { resolveAnswer } from '../convex/catalog/cite';
import { STAGE_CODES } from '../convex/catalog/stageSemantics';

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

it('links a bill handle to its bill page', () => {
  const s = toSource('bills:1234hr119');
  assert.equal(s.kind, 'db');
  assert.equal(s.dataset, 'bills');
  assert.equal(s.href, '/bills/1234hr119');
});

it('links a topic handle to its topic page, slugified', () => {
  const s = toSource('topics:119:Health');
  assert.equal(s.kind, 'db');
  assert.equal(s.href, '/bills/topic/health');
});

it('slugifies a multi-word topic', () => {
  assert.equal(
    toSource('topics:119:Armed Forces and National Security').href,
    '/bills/topic/armed-forces-and-national-security',
  );
});

it('links a sponsor handle to a filtered bill list', () => {
  const s = toSource('sponsors:119:John Sarbanes');
  assert.equal(s.href, '/bills?sponsor=John+Sarbanes');
});

it('marks a web handle as web and gives it no internal href', () => {
  const s = toSource('web:1');
  assert.equal(s.kind, 'web');
  assert.equal(s.href, null);
});

it('carries an action handle back to its bill page', () => {
  assert.equal(toSource('bill_actions:1234hr119:3').href, '/bills/1234hr119');
});

it('carries a summary handle back to its bill page', () => {
  assert.equal(toSource('bill_summaries:1234hr119:2026-01-05').href, '/bills/1234hr119');
});

it('gives a stats handle no href, since there is no stats page', () => {
  assert.equal(toSource('stats:119').href, null);
});

it('degrades an unrecognised handle instead of throwing', () => {
  const s = toSource('nonsense');
  assert.equal(s.href, null);
  assert.ok(s.label.length > 0);
});

it('preserves order and numbering across a list', () => {
  const list = toSources(['bills:1hr119', 'topics:119:Health']);
  assert.equal(list.length, 2);
  assert.equal(list[0].dataset, 'bills');
  assert.equal(list[1].dataset, 'topics');
});

/**
 * D23 — the numbering desync.
 *
 * resolveAnswer numbers database rows and web results in ONE sequence. The
 * source list used to renumber each block from 1, so a web result cited first
 * pushed every database row's printed number one below what the prose said.
 * These tests read the numbers out of the real prose rather than asserting a
 * hand-written expectation.
 */
function proseNumbers(text: string): number[] {
  return [...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
}

const WEB_HIT: WebSource = {
  handle: 'web:1',
  url: 'https://www.congress.gov/bill/118th-congress/house-joint-resolution/39',
  title: 'H.J.Res. 39 — veto message',
  excerpt: 'Vetoed by President.',
};

it('numbers a database row by its place in the prose, not in its block', () => {
  // The broken case: a web result is cited BEFORE the bill, so the bill is [2].
  const allowed = new Set(['web:1', 'bills:39hjres118']);
  const answer = resolveAnswer(
    'The veto was reported at the time [[cite:web:1]]; our record for ' +
      'H.J.Res. 39 shows stage 85 [[cite:bills:39hjres118]].',
    allowed,
  );

  assert.deepEqual(proseNumbers(answer.text), [1, 2]);

  const { db, web } = printedSources(answer.sources, [WEB_HIT]);
  assert.equal(db.length, 1);
  assert.equal(db[0].source.handle, 'bills:39hjres118');
  assert.equal(db[0].number, 2, 'the prose calls this bill [2]');
  assert.equal(web.length, 1);
  assert.equal(web[0].number, 1, 'the prose calls this web result [1]');
});

it('keeps every printed number equal to the prose number for the same handle', () => {
  const allowed = new Set([
    'web:1',
    'bills:39hjres118',
    'web:2',
    'bill_actions:39hjres118:12',
  ]);
  const answer = resolveAnswer(
    'A [[cite:web:1]] B [[cite:bills:39hjres118]] C [[cite:web:2]] ' +
      'D [[cite:bill_actions:39hjres118:12]] and again [[cite:bills:39hjres118]].',
    allowed,
  );
  const hits: WebSource[] = [
    WEB_HIT,
    { handle: 'web:2', url: 'https://www.presidency.ucsb.edu/veto', excerpt: '' },
  ];

  const { db, web } = printedSources(answer.sources, hits);
  const printed = new Map<string, number>();
  for (const row of db) printed.set(row.source.handle, row.number);
  for (const row of web) if (row.number !== null) printed.set(row.handle, row.number);

  // Every handle's printed number is the number resolveAnswer wrote for it.
  for (const [i, handle] of answer.sources.entries()) {
    assert.equal(printed.get(handle), i + 1, `${handle} printed with the wrong number`);
  }
  // A handle cited twice is printed once, at its first number.
  assert.equal(db.filter((r) => r.source.handle === 'bills:39hjres118').length, 1);
});

it('lists a web result the answer never cited, but gives it no number', () => {
  const answer = resolveAnswer(
    'Our record shows stage 85 [[cite:bills:39hjres118]].',
    new Set(['bills:39hjres118', 'web:1']),
  );
  const { db, web } = printedSources(answer.sources, [WEB_HIT]);

  assert.equal(db[0].number, 1);
  assert.equal(web.length, 1, 'a result the model read stays visible');
  assert.equal(web[0].number, null, 'no citation points at it, so no number');
  assert.equal(web[0].web?.url, WEB_HIT.url);
});

it('still prints a cited web source whose result detail is missing', () => {
  const { web } = printedSources(['web:1', 'bills:39hjres118']);
  assert.equal(web.length, 1);
  assert.equal(web[0].number, 1);
  assert.equal(web[0].web, null);
});

it('puts cited web results before uncited ones, in prose order', () => {
  const hits: WebSource[] = [
    { handle: 'web:1', url: 'https://example.org/one', excerpt: '' },
    { handle: 'web:2', url: 'https://example.org/two', excerpt: '' },
    { handle: 'web:3', url: 'https://example.org/three', excerpt: '' },
  ];
  const { web } = printedSources(['bills:39hjres118', 'web:3', 'web:1'], hits);
  assert.deepEqual(
    web.map((r) => [r.handle, r.number]),
    [
      ['web:3', 2],
      ['web:1', 3],
      ['web:2', null],
    ],
  );
});

/**
 * The same invariant read from the reader's side. The test above proves each
 * handle carries its prose number; this one proves each number the reader can
 * see has exactly one row to land on, across BOTH blocks — the failure a
 * future de-duplication or merge of the two lists would reintroduce.
 */
it('gives every number the prose prints exactly one row, in one block', () => {
  const answer = resolveAnswer(
    'Reported at the time [[cite:web:1]]. Our records for H.J.Res. 39 ' +
      '[[cite:bills:39hjres118]] and H.J.Res. 45 [[cite:bills:45hjres118]] ' +
      'both show stage 85, and another page agrees [[cite:web:2]].',
    new Set(['web:1', 'bills:39hjres118', 'bills:45hjres118', 'web:2']),
  );
  const hits: WebSource[] = [
    WEB_HIT,
    { handle: 'web:2', url: 'https://www.presidency.ucsb.edu/veto', excerpt: '' },
    { handle: 'web:3', url: 'https://example.org/never-cited', excerpt: '' },
  ];

  const { db, web } = printedSources(answer.sources, hits);
  const printed = [...db.map((r) => r.number), ...web.map((r) => r.number)].filter(
    (n): n is number => n !== null,
  );

  assert.deepEqual(proseNumbers(answer.text), [1, 2, 3, 4]);
  for (const n of proseNumbers(answer.text)) {
    assert.equal(printed.filter((p) => p === n).length, 1, `[${n}] has no single row`);
  }
  assert.equal(new Set(printed).size, printed.length, 'two rows printed the same number');
  // Rows stay in prose order within their own block, so the eye scans downward.
  assert.deepEqual(
    db.map((r) => r.number),
    [2, 3],
  );
});

it('drops nothing when only database rows are cited', () => {
  const { db, web } = printedSources(['bills:3028hr119', 'sponsors:119:Steve Womack']);
  assert.deepEqual(
    db.map((r) => r.number),
    [1, 2],
  );
  assert.equal(web.length, 0);
});

/**
 * D29 — the in-answer entity card read "Unknown" for a vetoed bill,
 * contradicting the prose above it. 85 is a real stage (H.J.Res. 39 of the
 * 118th is one of 15 vetoed bills in the stored data); it was simply missing
 * from the compact card's own copy of the label map. The map now lives in
 * lib/utils/bill-stages.ts, which the entity card reaches through
 * CompactBillCard.
 */
it('labels a vetoed bill Vetoed, not Unknown', () => {
  assert.equal(compactStageLabel(85), 'Vetoed');
});

it('labels every stage code the backend can store', () => {
  // STAGE_CODES comes from the catalog, which mirrors convex/billStage.ts —
  // the codes a stored bill can actually carry.
  for (const code of STAGE_CODES) {
    const label = compactStageLabel(code);
    assert.ok(label.length > 0, `stage ${code} has no label`);
    assert.doesNotMatch(label, /^(Unknown|Stage )/, `stage ${code} reads as "${label}"`);
  }
});

it('labels exactly the eight stage codes, no more and no fewer', () => {
  assert.deepEqual(
    Object.keys(CompactStageLabel)
      .map(Number)
      .sort((a, b) => a - b),
    [...STAGE_CODES].sort((a, b) => a - b),
  );
});

it('names an unrecognised stage instead of guessing a neighbour', () => {
  assert.equal(compactStageLabel(55), 'Stage 55');
  assert.equal(compactStageLabel(Number.NaN), 'Unknown');
});

console.log(`\nanswer-format: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
