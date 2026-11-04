/**
 * Unit tests for the civics dictionary (lib/glossary.ts) behind `<Term>`.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import {
  BILL_WORDS_MAX,
  billPageWords,
  measureTermId,
  stageLine,
  stageTermId,
  termify,
  TERM_GROUPS,
  TERM_IDS,
  TERMS,
} from './glossary';

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`);
  }
}

it('every word belongs to a group the Learn page lists', () => {
  const groups = new Set(TERM_GROUPS.map((g) => g.id));
  for (const id of TERM_IDS) assert.ok(groups.has(TERMS[id].group), id);
});

it('definitions stay short: two sentences, under 200 characters', () => {
  for (const id of TERM_IDS) {
    // A sentence ends at a stop before a capital: "H.Res. or" is not an end.
    const d = TERMS[id].definition;
    assert.ok(d.length <= 200, `${id} is ${d.length} characters`);
    assert.ok((d.match(/[.!?](\s+[A-Z“]|$)/g) ?? []).length <= 2, `${id} has more than two sentences`);
  }
});

it('marks only the first appearance of a word', () => {
  const pieces = termify('Sent to committee. The committee met.', ['committee']);
  assert.deepEqual(pieces, ['Sent to ', { id: 'committee', text: 'committee' }, '. The committee met.']);
});

it('prefers the longest phrase, and keeps the plural as written', () => {
  const pieces = termify('three kinds of resolution: simple resolutions (H.Res.)', ['resolution', 'simple-resolution']);
  assert.deepEqual(pieces, [
    'three kinds of ',
    { id: 'resolution', text: 'resolution' },
    ': ',
    { id: 'simple-resolution', text: 'simple resolutions' },
    ' (H.Res.)',
  ]);
});

it('matches whole words only', () => {
  assert.deepEqual(termify('Vetoes are rare.', ['veto']), ['Vetoes are rare.']);
  assert.deepEqual(termify('or over a veto.', ['veto']), ['or over a ', { id: 'veto', text: 'veto' }, '.']);
});

it('names a stage the way the page does: an agreed resolution is "agreed to"', () => {
  assert.equal(stageTermId(40, 'hr'), 'in-committee');
  assert.equal(stageTermId(100, 'hr'), 'became-law');
  assert.equal(stageTermId(60, 'hr'), 'passed-one-chamber');
  assert.equal(stageTermId(60, 'hres'), 'agreed-to');
  assert.equal(stageTermId(60, 'hconres'), 'passed-one-chamber');
  assert.equal(stageTermId(80, 'sconres'), 'agreed-to');
  assert.equal(stageTermId(55, 'hr'), null);
});

it('names the kind of measure from its type', () => {
  assert.equal(measureTermId('hr'), 'bill');
  assert.equal(measureTermId('s'), 'bill');
  assert.equal(measureTermId('hres'), 'simple-resolution');
  assert.equal(measureTermId('sconres'), 'concurrent-resolution');
  assert.equal(measureTermId('hjres'), 'joint-resolution');
  assert.equal(measureTermId('S.J.Res.'), 'joint-resolution');
});

it('every stage the status card can name has its plain line', () => {
  for (const stage of [20, 40, 50, 60, 80, 85, 90, 95, 100]) {
    const id = stageTermId(stage, 'hr');
    assert.ok(id && stageLine(id, 'hr'), `stage ${stage} has no line`);
  }
  assert.match(stageLine('in-committee', 'hr')!, /Most bills stop here/);
  // A resolution's last step is a finish line, not half-way.
  assert.match(stageLine(stageTermId(60, 'hres')!, 'hres')!, /^The room said yes/);
  assert.match(stageLine(stageTermId(80, 'hconres')!, 'hconres')!, /^Both rooms said yes/);
  assert.equal(stageLine('committee', 'hr'), null);
});

it("a bill page's word list leads with its own kind, keeps reading order, and stops at the cap", () => {
  const words = billPageWords('simple-resolution', ['congress-number', 'sponsor', null, 'sponsor', false, 'agreed-to']);
  assert.deepEqual(words, ['simple-resolution', 'congress-number', 'sponsor', 'agreed-to']);
  assert.equal(billPageWords('bill', TERM_IDS).length, BILL_WORDS_MAX);
  assert.equal(billPageWords('bill', ['bill', 'sponsor'])[0], 'bill');
});

it('a law page that uses too many words keeps its stage and its votes, not every stage name', () => {
  // H.R. 1276, in the order its page uses them: 14 words for 9 places.
  const used = [
    'congress-number', 'sponsor', 'crs', 'became-law', 'in-committee', 'out-of-committee', 'floor',
    'unanimous-consent', 'passed-one-chamber', 'voice-vote', 'passed-both-chambers', 'to-president',
    'public-law', 'cosponsor',
  ] as const;
  const words = billPageWords('bill', [...used], 'became-law');
  assert.equal(words.length, BILL_WORDS_MAX);
  assert.equal(words[0], 'bill');
  for (const id of ['became-law', 'public-law', 'voice-vote', 'unanimous-consent', 'cosponsor'] as const) {
    assert.ok(words.includes(id), `${id} was dropped`);
  }
  assert.ok(!words.includes('to-president'));
  // Still in reading order.
  assert.ok(words.indexOf('crs') < words.indexOf('became-law'));
});

if (failures.length > 0) {
  console.error(`\nglossary: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`glossary: all ${passed} tests passed`);
