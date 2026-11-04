/**
 * Unit tests for the civics dictionary (lib/glossary.ts) behind `<Term>`.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { isPocketVeto } from './bill-journey';
import {
  BILL_WORDS_MAX,
  billPageWords,
  measureTermId,
  stageLine,
  stageTermId,
  statusCardLine,
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
  // "Agreed to by one chamber" on the page: its word is "Agreed to", not
  // "Passed one chamber" (/bills/93hconres119).
  assert.equal(stageTermId(60, 'hconres'), 'agreed-to');
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

it('the status card line follows the measure type: a concurrent resolution has two rooms', () => {
  // /bills/37sconres119 printed "The room said yes" (one room): the call site
  // dropped the type.
  assert.match(statusCardLine(80, 'sconres')!, /^Both rooms said yes/);
  assert.match(statusCardLine(80, 'hconres')!, /^Both rooms said yes/);
  assert.match(statusCardLine(60, 'hres')!, /^The room said yes/);
  assert.equal(statusCardLine(100, 'hres'), null);
});

it('passed both chambers never says the two rooms passed the same words', () => {
  assert.doesNotMatch(statusCardLine(80, 's')!, /same words/);
  assert.doesNotMatch(TERMS['passed-both-chambers'].definition, /same words/);
});

// "A small group of members is studying it first" — most referred bills are
// never worked on at all; and "the leader" reads as the party leader.
it('committee and floor-vote words claim only what is true', () => {
  assert.doesNotMatch(statusCardLine(40, 'hr')!, /studying/);
  assert.match(statusCardLine(40, 'hr')!, /decide whether it moves on/);
  assert.doesNotMatch(TERMS['voice-vote'].definition, /leader/);
  assert.doesNotMatch(TERMS['unanimous-consent'].definition, /leader/);
  assert.doesNotMatch(TERMS.signed.definition, /few days/);
});

it('a measure from an ended Congress is not described as still moving', () => {
  // /bills/82sjres118: "A small group of members is studying it first", above
  // "it expired when the 118th Congress ended".
  assert.equal(statusCardLine(40, 'sjres', true), null);
  assert.equal(statusCardLine(60, 'hr', true), null);
  assert.equal(statusCardLine(60, 'hconres', true), null);
  // Finished measures keep their line: the end of the Congress changed nothing.
  assert.match(statusCardLine(100, 'hr', true)!, /law/);
  assert.match(statusCardLine(60, 'hres', true)!, /finish line/);
  assert.match(statusCardLine(80, 'sconres', true)!, /finish line/);
});

it('the definitions do not say a signature is the only way to law, or that every joint resolution goes to the President', () => {
  assert.match(TERMS.bill.definition, /overrides a veto/);
  assert.match(TERMS['joint-resolution'].definition, /Constitution/);
  assert.match(TERMS['to-president'].definition, /becomes law anyway/);
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

// Each case below is a sentence a reader got, found by the civics fact-check
// of 2026-11-04, and the rule it broke.

it('a veto line states the rule, not that this bill can "still" be saved', () => {
  // /bills/131hr119: "Two in three members of each room can still overrule
  // that", after the House's override had failed. Stage 85 also holds pocket
  // vetoes, which cannot be overridden.
  const line = statusCardLine(85, 'hr')!;
  assert.doesNotMatch(line, /\bstill\b/);
  assert.equal(line, 'The President said no. Congress can overrule a veto only if two in three of the members voting in each room agree.');
});

it('the override threshold is two in three of the members voting, not of all members', () => {
  // "two out of three members in both rooms": Art. I, §7 counts members
  // present and voting.
  assert.doesNotMatch(TERMS.veto.definition, /two out of three members in both rooms/);
  assert.match(TERMS.veto.definition, /two in three of the members voting in each room/);
  // Not "it can still become law": shown on /bills/131hr119, whose override failed.
  assert.doesNotMatch(TERMS.veto.definition, /\bstill\b/);
});

it('out of committee never says a committee sent on a bill that skipped committee', () => {
  // /bills/6s119 (S. 6, a Rule XIV bill never referred): "The committee sent
  // it on." and "The committee voted to send the bill to the floor."
  assert.doesNotMatch(statusCardLine(50, 's')!, /^The committee sent it on/);
  assert.match(statusCardLine(50, 's')!, /never went to one/);
  assert.doesNotMatch(TERMS['out-of-committee'].definition, /The committee voted/);
  assert.match(TERMS['out-of-committee'].definition, /never went to one/);
});

it('in committee: the committee usually decides, not always', () => {
  // "which decides whether the whole room ever votes on it": a discharge
  // petition or a suspension vote can bring a bill to the floor without it.
  assert.match(TERMS['in-committee'].definition, /which usually decides/);
});

it('a pocket veto needs an adjournment that stops the bill coming back, not any adjournment', () => {
  // "it becomes law anyway, unless Congress has adjourned; then it dies":
  // Congress adjourns every day.
  assert.doesNotMatch(TERMS['to-president'].definition, /unless Congress has adjourned;/);
  // Same rule as the next step in lib/bill-next-step.ts, in fewer words.
  assert.match(TERMS['to-president'].definition, /can’t be sent back/);
});

it('"agreed to" is the finish line only for a simple resolution', () => {
  // "For a resolution, this is the finish line": a concurrent resolution one
  // room agreed to still needs the other.
  assert.doesNotMatch(TERMS['agreed-to'].definition, /For a resolution, this is the finish line/);
  assert.match(TERMS['agreed-to'].definition, /concurrent resolution needs both rooms/);
});

it('a law is a law of the United States, not a rule everyone has to follow', () => {
  // /bills/7022hr119, /bills/952hr119: "Everyone in the country has to follow
  // it." Many laws direct one agency, move land or name a building.
  assert.doesNotMatch(TERMS['became-law'].definition, /everyone in the country/i);
  assert.doesNotMatch(statusCardLine(100, 'hr')!, /everyone in the country/i);
  assert.equal(statusCardLine(100, 'hr'), 'It is a law of the United States now.');
});

it('a bill has three ways to become law, not two', () => {
  assert.match(TERMS.bill.definition, /10 days pass without a veto/);
  assert.match(TERMS.bill.definition, /overrides a veto/);
});

it('the research service writes summaries of bills, not of each bill', () => {
  // "They write the plain summary of each bill": many bills have none, and the
  // rest get one weeks after they are introduced.
  assert.doesNotMatch(TERMS.crs.definition, /summary of each bill/);
});

it('a proposed amendment to the Constitution needs two-thirds of each room', () => {
  assert.match(TERMS['joint-resolution'].definition, /two-thirds of each room/);
});

it('the stage words on a resolution page do not call it a bill or say "pass"', () => {
  // /bills/93hconres119, "Agreed to by one chamber": "The bill was sent to a
  // committee…" and "pass the very same words".
  for (const id of ['introduced', 'in-committee', 'out-of-committee', 'passed-one-chamber'] as const) {
    assert.doesNotMatch(TERMS[id].definition, /\bthe bill\b|\bpass\b/i, id);
  }
  assert.equal(statusCardLine(60, 'hconres'), 'One room said yes. The other room has to say yes too.');
  assert.doesNotMatch(TERMS.district.definition, /small states have one/);
});

// A pocket-vetoed bill's card said "Congress can overrule a veto only if two in
// three…" directly above "What happens next: Nothing more: this was a pocket
// veto… No vote can override it."
it('a pocket veto line does not offer an override', () => {
  const pocket = { kind: 'vetoed' as const, date: '2020-12-23', label: 'Pocket vetoed by the President' };
  const plain = { kind: 'vetoed' as const, date: '2025-12-29', label: 'Vetoed by the President' };
  const line = statusCardLine(85, 'hr', false, { pocketVeto: isPocketVeto([pocket]) })!;
  assert.doesNotMatch(line, /two in three|overrule a veto only if/);
  assert.match(line, /pocket veto/);
  assert.match(line, /No vote can overrule it\./);
  // An ordinary veto keeps the rule.
  assert.match(statusCardLine(85, 'hr', false, { pocketVeto: isPocketVeto([plain]) })!, /two in three/);
  assert.equal(isPocketVeto(undefined), false);
  // An ended Congress still prints no present-tense line.
  assert.equal(statusCardLine(85, 'hr', true, { pocketVeto: true }), null);
});

if (failures.length > 0) {
  console.error(`\nglossary: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`glossary: all ${passed} tests passed`);
