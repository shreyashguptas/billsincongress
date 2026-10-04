/**
 * Recognising a member's name typed into the /bills title search.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { matchSponsorName, nameTokens } from './sponsor-match';

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

// Names as `bills.listAllSponsors` returns them (production, 2026-09-30),
// including the two Collinses and an all-caps row.
const SPONSORS = [
  'Jamie Raskin',
  'Mike Collins',
  'Susan M. Collins',
  'Jon Ossoff',
  'Elizabeth Warren',
  'Mark Warner',
  'Jefferson Van Drew',
  'Nydia M. Velázquez',
  'DAVID PRICE',
  'Troy E. Nehls',
  'Kevin Hern',
].map((name) => ({ name }));

const matched = (q: string) => matchSponsorName(q, SPONSORS)?.sponsor.name ?? null;

// Real empty title searches on /bills, 26–30 Sep 2026.
it('finds the members readers searched for by full name', () => {
  assert.equal(matched('mike collins'), 'Mike Collins');
  assert.equal(matched('jamie raskin'), 'Jamie Raskin');
  assert.equal(matched('jon ossoff'), 'Jon Ossoff');
  assert.equal(matched('elizabeth warren'), 'Elizabeth Warren');
  assert.equal(matchSponsorName('Jamie Raskin', SPONSORS)?.kind, 'full_name');
});

it('finds a member by last name when only one has it', () => {
  assert.equal(matched('warner'), 'Mark Warner');
  assert.equal(matched('Raskin'), 'Jamie Raskin');
  assert.equal(matchSponsorName('warner', SPONSORS)?.kind, 'last_name');
});

it('handles two-word last names', () => {
  assert.equal(matched('van drew'), 'Jefferson Van Drew');
});

it('skips middle initials, accents, case and stray punctuation', () => {
  assert.equal(matched('Nydia Velazquez'), 'Nydia M. Velázquez');
  assert.equal(matchSponsorName('nydia velazquez', SPONSORS)?.kind, 'first_last');
  assert.equal(matched('susan collins'), 'Susan M. Collins');
  assert.equal(matched('david price'), 'DAVID PRICE');
  assert.equal(matched('  Jamie   Raskin? '), 'Jamie Raskin');
});

it('suggests nobody when a last name belongs to more than one member', () => {
  assert.equal(matched('collins'), null);
});

it('suggests nobody for a name that is not a member of Congress', () => {
  assert.equal(matched('michael jackson'), null);
});

it('does not read topic searches as names', () => {
  for (const q of ['education', 'bills about education', 'climate change', 'farm', 'act', '']) {
    assert.equal(matched(q), null, q);
  }
});

it('does not guess from a first name alone, or from a surname under three letters', () => {
  assert.equal(matched('jamie'), null);
  assert.equal(matchSponsorName('li', [{ name: 'Ted Li' }]), null);
});

// The production list (2026-10-04) holds 45 members under two spellings, as
// separate rows. Each was read as two people, so "velazquez" or "adam schiff"
// looked ambiguous and got no suggestion.
const TWO_SPELLINGS = [
  { name: 'NYDIA VELAZQUEZ', party: 'D', state: 'NY' },
  { name: 'Nydia Velázquez', party: 'D', state: 'NY' },
  { name: 'ADAM SCHIFF', party: 'D', state: 'CA' },
  { name: 'Adam Schiff', party: 'D', state: 'CA' },
  { name: 'Adam Smith', party: 'D', state: 'WA' },
  { name: 'Jason Smith', party: 'R', state: 'MO' },
];

it('treats two spellings of one member as one member, and filters by both', () => {
  const v = matchSponsorName('velazquez', TWO_SPELLINGS);
  assert.equal(v?.sponsor.name, 'Nydia Velázquez');
  assert.deepEqual(v?.names, ['NYDIA VELAZQUEZ', 'Nydia Velázquez']);
  assert.equal(v?.kind, 'last_name');
  const s = matchSponsorName('adam schiff', TWO_SPELLINGS);
  assert.equal(s?.sponsor.name, 'Adam Schiff');
  assert.deepEqual(s?.names, ['ADAM SCHIFF', 'Adam Schiff']);
  assert.deepEqual(matchSponsorName('jamie raskin', SPONSORS)?.names, ['Jamie Raskin']);
});

it('keeps two different people with the same name apart', () => {
  const rogers = [
    { name: 'Mike Rogers', party: 'R', state: 'AL' },
    { name: 'MIKE ROGERS', party: 'R', state: 'MI' },
  ];
  assert.equal(matchSponsorName('mike rogers', rogers), null);
  assert.equal(matchSponsorName('smith', TWO_SPELLINGS), null);
});

it('drops name suffixes readers leave off', () => {
  assert.deepEqual(nameTokens('Mike Collins Jr.'), ['mike', 'collins']);
  assert.equal(matchSponsorName('mike collins', [{ name: 'Mike Collins Jr.' }])?.sponsor.name, 'Mike Collins Jr.');
});

console.log(`\nsponsor-match: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
