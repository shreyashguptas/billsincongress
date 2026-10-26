/**
 * Bills made clickable where an answer names them.
 *
 * The case this exists for, live on 2026-10-26: "what is the tea for today"
 * listed three new laws as bullets nobody could click, then the same three
 * again as cards. An item of a list OF bills now becomes that bill's card,
 * and the cards after the prose drop the bills already shown.
 *
 * Most of this file is the other side of that: the questions whose lists must
 * NOT turn into cards, because the list is the answer ("the key parts of
 * H.R. 1", "how do these two differ", "how did the vote go").
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CardList,
  answerBills,
  sponsorSurname,
  billsNamedIn,
  cardListBills,
  cardLists,
  firstListStart,
  onlyIdentifies,
  rehypeBillLinks,
} from './answer-bill-links';

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

const law = (label: string, title: string, sponsor: string, sponsorParty: string) => ({
  label,
  title,
  sponsor,
  sponsorParty,
  progressStage: 100,
});
const ENTITIES = {
  'bills:7022hr119': law('H.R. 7022', 'Mystic Alerts Act', 'August Pfluger', 'R'),
  'bills:952hr119': law('H.R. 952', 'Reversionary Interest Conveyance Act', 'Doris Matsui', 'D'),
  'bills:3620hr119': law('H.R. 3620', 'Southcentral Foundation Land Transfer Act of 2025', 'Nicholas Begich', 'R'),
  'bills:1hr119': law('H.R. 1', 'One Big Beautiful Bill Act', 'Jodey Arrington', 'R'),
  'bills:10hr119': law('H.R. 10', 'Tenth Example Act', 'Some Member', 'D'),
  'bills:10894hr119': law('H.R. 10894', 'Disaster Data Protection Act', 'Brittany Pettersen', 'D'),
  'bills:1635hres119': {
    label: 'H.Res. 1635',
    title: 'Supporting the designation of October 23, 2026, as "National Marine Sanctuary Day".',
    sponsor: 'Jack Bergman',
    sponsorParty: 'R',
    progressStage: 20,
  },
  'bills:5hres119': { label: 'H.Res. 5', title: 'Adopting the Rules of the House', sponsor: 'Steve Scalise', sponsorParty: 'R', progressStage: 30 },
};
const SOURCES = [
  'bills:7022hr119', // [1]
  'bills:952hr119', // [2]
  'bills:3620hr119', // [3]
  'stats:119', // [4] — not a bill
  'bill_summaries:1hr119:00', // [5]
  'bill_actions:1hr119:all', // [6]
  'bill_actions:4242hr119:all', // [7] — given only its timeline: no card data
  'web:1', // [8]
  'bills:10894hr119', // [9]
  'bills:1635hres119', // [10]
];
const ALLOWED = [...Object.keys(ENTITIES), ...SOURCES];
const bills = answerBills(SOURCES, ALLOWED, ENTITIES);
const cards = (text: string) => [...cardListBills(text, bills)].sort();

// ── Which bill a piece of text names ────────────────────────────────────────

it('maps a citation to its bill, through a summary or a timeline too', () => {
  assert.equal(bills.byNumber.get(1)?.id, '7022hr119');
  assert.equal(bills.byNumber.get(5)?.id, '1hr119');
  assert.equal(bills.byNumber.get(6)?.id, '1hr119');
});

it('ignores citations of things that are not bills', () => {
  assert.deepEqual(billsNamedIn('138 laws in total. [4] A news story said so. [8]', bills), []);
});

it('never links a citation the answer was not given', () => {
  const invented = answerBills(['bills:9999hr119'], []);
  assert.equal(invented.byNumber.size, 0);
});

it('finds bills by citation, number or title, in order, once each', () => {
  const named = billsNamedIn('The Reversionary Interest Conveyance Act [2] and H.R. 7022 [1], again [2].', bills);
  assert.deepEqual(named.map((b) => b.id), ['952hr119', '7022hr119']);
});

it('reads a bill number however it is punctuated', () => {
  for (const text of ['HR 7022', 'H.R.7022', 'h.r. 7022', 'H. R. 7022']) {
    assert.deepEqual(billsNamedIn(text, bills).map((b) => b.id), ['7022hr119'], text);
  }
  assert.deepEqual(billsNamedIn('H.Res. 5 set the rules', bills).map((b) => b.id), ['5hres119']);
});

it('does not read H.R. 10 as H.R. 1, or H.R. 1 inside H.R. 100', () => {
  assert.deepEqual(billsNamedIn('H.R. 10 passed.', bills).map((b) => b.id), ['10hr119']);
  assert.deepEqual(billsNamedIn('H.R. 100 passed.', bills), []);
  assert.deepEqual(billsNamedIn('S.H.R. 1x', bills), []);
});

it('prints a two-word surname whole, from the stored surname (review, 2026-10-26)', () => {
  assert.equal(sponsorSurname({ sponsor: 'Jefferson Van Drew', sponsorLastName: 'Van Drew' }), 'Van Drew');
  assert.equal(sponsorSurname({ sponsor: 'Monica De La Cruz', sponsorLastName: 'De La Cruz' }), 'De La Cruz');
  // An answer saved before the projection carried it: the last word, the old guess.
  assert.equal(sponsorSurname({ sponsor: 'August Pfluger' }), 'Pfluger');
  assert.equal(sponsorSurname(undefined), undefined);
});

// ── Which lists become cards ────────────────────────────────────────────────

it('names neither bill when two share a title or a number (review, 2026-10-26)', () => {
  const twins = answerBills(['bills:5s119', 'bills:29hr119'], ['bills:5s119', 'bills:29hr119', 'bills:1hr118', 'bills:1hr119'], {
    'bills:5s119': law('S. 5', 'Laken Riley Act', 'Katie Britt', 'R'),
    'bills:29hr119': law('H.R. 29', 'Laken Riley Act', 'Mike Collins', 'R'),
    'bills:1hr118': law('H.R. 1', 'Lower Energy Costs Act', 'Steve Scalise', 'R'),
    'bills:1hr119': law('H.R. 1', 'One Big Beautiful Bill Act', 'Jodey Arrington', 'R'),
  });
  assert.deepEqual(billsNamedIn('The Laken Riley Act became law.', twins), []);
  assert.deepEqual(billsNamedIn('H.R. 1 became law in July.', twins), []);
  // Its citation still says which one is meant.
  assert.deepEqual(billsNamedIn('The Laken Riley Act [1]', twins).map((b) => b.id), ['5s119']);
  assert.deepEqual([...cardListBills('- The Laken Riley Act, signed into law\n- H.R. 1 [9]', twins)], []);
});

it('keeps a list as text when an item cites a source that is not its bill', () => {
  assert.deepEqual(cards('- H.R. 7022 [1][4]\n- H.R. 952 [2]'), []);
});

it('turns the newest-laws list into cards (the 2026-10-26 answer, word for word)', () => {
  const answer = `The three newest laws are:

- The Mystic Alerts Act (H.R. 7022), from Rep. August Pfluger (R-TX), last acted on October 22, 2026. [1]
- The Reversionary Interest Conveyance Act (H.R. 952), from Rep. Doris Matsui (D-CA), also last acted on October 22, 2026. [2]
- The Southcentral Foundation Land Transfer Act of 2025 (H.R. 3620), from Rep. Nicholas Begich (R-AK), last acted on October 20, 2026. [3]

[[bills:7022hr119,952hr119,3620hr119]]`;
  assert.deepEqual(cards(answer), ['3620hr119', '7022hr119', '952hr119']);
});

it('turns a list into cards when the answer paraphrases a title (live, 2026-10-26)', () => {
  const answer = `Here are a few:

- The Disaster Data Protection Act, from Rep. Brittany Pettersen (D-CO) [9]
- A resolution supporting "National Marine Sanctuary Day" on October 23, from Rep. Jack Bergman (R-MI) [10]`;
  assert.deepEqual(cards(answer), ['10894hr119', '1635hres119']);
});

it('turns "sponsored by…, with its latest action on…" into cards (live, 2026-10-26)', () => {
  const answer = `- **Mystic Alerts Act (H.R. 7022)**: sponsored by Rep. August Pfluger (R-TX), with its latest action on October 22, 2026. [1]
- **Reversionary Interest Conveyance Act (H.R. 952)**: sponsored by Rep. Doris Matsui (D-CA), with its latest action on October 22, 2026. [2]
- **Southcentral Foundation Land Transfer Act of 2025 (H.R. 3620)**: sponsored by Rep. Nicholas Begich (R-AK), with its latest action on October 20, 2026. [3]`;
  assert.deepEqual(cards(answer), ['3620hr119', '7022hr119', '952hr119']);
});

it('turns a list into cards when the answer adds each bill\'s policy area (live, 2026-10-26)', () => {
  const answer = `- **Mystic Alerts Act (H.R. 7022)**, sponsored by Rep. August Pfluger (R-TX). It is in Science, Technology, Communications, and its latest action was October 22, 2026. [1]
- **Reversionary Interest Conveyance Act (H.R. 952)**, sponsored by Rep. Doris Matsui (D-CA). It is in Public Lands and Natural Resources, and its latest action was October 22, 2026. [2]
- **Southcentral Foundation Land Transfer Act of 2025 (H.R. 3620)**, sponsored by Rep. Nicholas Begich (R-AK). It is in Public Lands and Natural Resources, and its latest action was October 20, 2026. [3]`;
  assert.deepEqual(cards(answer), ['3620hr119', '7022hr119', '952hr119']);
  assert.deepEqual(cards('- H.R. 7022, a Taxation bill [1]\n- H.R. 952 (policy area: Health) [2]'), ['7022hr119', '952hr119']);
  // A policy-area WORD in a sentence about what the bill does is still the answer.
  assert.deepEqual(cards('- H.R. 7022 lowers health costs [1]\n- H.R. 952 [2]'), []);
});

it('accepts the other ways an item names a bill and its sponsor', () => {
  const pf = bills.byId.get('7022hr119')!;
  for (const item of [
    'H.R. 7022 — introduced by Rep. Pfluger of Texas, now law [1]',
    'Mystic Alerts Act: a House bill from Pfluger, a Republican, that became law last week [1]',
    'H.R. 7022 (Pfluger, R-TX-11), signed by the President on Oct. 22 [1]',
    'The Mystic Alerts Act, which passed both chambers and was signed into law [1]',
  ]) {
    assert.equal(onlyIdentifies(item, pf, bills), true, item);
  }
});

it('keeps an item as text when it says what the bill does', () => {
  const pf = bills.byId.get('7022hr119')!;
  for (const item of [
    'H.R. 7022 would send emergency warnings by satellite [1]',
    'H.R. 7022, which the CBO says costs nothing [1]',
    'H.R. 7022 passed 410 to 12 [1]',
    'H.R. 7022 — reported by committee 30 to 1 [1]',
    // Review, 2026-10-26: the card shows only the sponsor, and only that it passed.
    'H.R. 7022 [1] — cosponsored by Democrats',
    'H.R. 7022 [1] — passed the House by voice vote',
    'H.R. 7022, agreed to by unanimous consent [1]',
    'H.R. 7022 is controversial with privacy groups [1]',
  ]) {
    assert.equal(onlyIdentifies(item, pf, bills), false, item);
  }
});

it('turns a numbered list and a bare list of titles into cards', () => {
  assert.deepEqual(cards('1. H.R. 7022 [1]\n2. H.R. 952 [2]'), ['7022hr119', '952hr119']);
  assert.deepEqual(cards('- **Mystic Alerts Act**\n- *Reversionary Interest Conveyance Act*'), ['7022hr119', '952hr119']);
  assert.deepEqual(cards('* Mystic Alerts Act — Rep. Pfluger (R-TX-11), signed into law Oct. 22 [1]'), ['7022hr119']);
});

it('keeps a list of facts about ONE bill as text — never the same card three times', () => {
  const answer = `H.R. 1 does three main things:

- H.R. 1 extends the 2017 tax cuts. [5]
- H.R. 1 cuts Medicaid spending. [5]
- H.R. 1 raises the debt limit. [6]`;
  assert.deepEqual(cards(answer), []);
});

it('keeps a list as text when an item carries the answer, not just the bill', () => {
  assert.deepEqual(cards('- H.R. 7022 requires flood alerts on phones. [1]\n- H.R. 952 returns land to a city. [2]'), []);
  assert.deepEqual(cards('- H.R. 7022 passed the House 410 to 12. [1]\n- H.R. 952 [2]'), []);
  assert.deepEqual(cards('- H.R. 7022, which costs $4 billion [1]'), []);
});

it('keeps a list as text when one item is not a bill — a list never mixes', () => {
  assert.deepEqual(cards('- H.R. 7022 [1]\n- 138 laws in total [4]'), []);
  assert.deepEqual(cards('- H.R. 7022 and H.R. 952 [1][2]\n- H.R. 3620 [3]'), []);
});

it('keeps a list as text when a bill has no card data to show', () => {
  assert.deepEqual(cards('- H.R. 7022 [1]\n- The bill whose timeline we read [7]'), []);
});

it('falls back to text, not a wrong card, when the sponsor is named differently', () => {
  // "Nick" is not in the record's "Nicholas Begich": the safe failure is text with links.
  assert.equal(onlyIdentifies('H.R. 3620, from Rep. Nick Begich [3]', bills.byId.get('3620hr119')!, bills), false);
});

it('starts a new list when the marker changes, as markdown does', () => {
  assert.deepEqual(
    cardLists('- H.R. 7022 [1]\n\n* H.R. 1 cuts taxes [5]', bills).map((l) => l?.ids ?? null),
    [['7022hr119'], null],
  );
});

it('ignores list-like lines inside a code block', () => {
  assert.deepEqual(cardLists('```\n- H.R. 7022\n```', bills), []);
});

it('decides each list on its own', () => {
  const answer = `New laws:

- H.R. 7022 [1]
- H.R. 952 [2]

What H.R. 1 does:

- It extends the 2017 tax cuts. [5]
- It cuts Medicaid spending. [5]`;
  assert.deepEqual(cards(answer), ['7022hr119', '952hr119']);
});

it('reads a nested list as part of its item', () => {
  assert.deepEqual(cards('- H.R. 7022 [1]\n  - H.R. 952 [2]\n- H.R. 3620 [3]'), []);
});

it('finds nothing in an answer with no bills', () => {
  const none = answerBills(['stats:119'], ['stats:119']);
  assert.deepEqual([...cardListBills('- 138 laws [1]', none)], []);
});

// ── The rehype pass ─────────────────────────────────────────────────────────

type El = { type: 'element'; tagName: string; properties: Record<string, unknown>; children: Node[] };
type Node = El | { type: 'text'; value: string; position?: { start: { offset?: number } } };
const text = (value: string, offset?: number): Node =>
  offset === undefined ? { type: 'text', value } : { type: 'text', value, position: { start: { offset } } };
const el = (tagName: string, ...children: Node[]): El => ({ type: 'element', tagName, properties: {}, children });
const run = (tree: El, lists: (CardList | null)[] = []) => {
  rehypeBillLinks({ bills, lists })(tree as never);
  return tree;
};
const links = (n: El) => n.children.filter((c): c is El => c.type === 'element' && c.tagName === 'a');
/** The decisions for `markdown`, as the thread computes them from the full answer. */
const specs = (markdown: string) => cardLists(markdown, bills);

it('marks a list of bills as cards, and links nothing inside a card', () => {
  const a = el('li', text('The Mystic Alerts Act (H.R. 7022). [1]'));
  const b = el('li', text('H.R. 952 [2]'));
  const ul = el('ul', a, b);
  run(el('div', ul), specs('- The Mystic Alerts Act (H.R. 7022). [1]\n- H.R. 952 [2]'));
  assert.equal(ul.properties.dataCards, true);
  assert.deepEqual([a.properties.dataBill, b.properties.dataBill], ['7022hr119', '952hr119']);
  assert.equal(a.children.length, 1, 'a link inside the card would be a link inside a link');
});

it('makes an item its card from its first revealed word, so it never flashes as a bullet', () => {
  const done = el('li', text('H.R. 952 [2]'));
  const half = el('li', text('The Mys'));
  const ul = el('ul', done, half);
  run(el('div', ul), specs('- H.R. 952 [2]\n- The Mystic Alerts Act [1]'));
  assert.equal(half.properties.dataBill, '7022hr119');
});

it('leaves a list as text if the page and the full answer disagree', () => {
  const li = el('li', text('H.R. 3620 [3]'));
  const ul = el('ul', li);
  run(el('div', ul), specs('- H.R. 7022 [1]'));
  assert.equal(ul.properties.dataCards, undefined);
});

it('never puts a bill list\'s cards on a list of facts (review, 2026-10-26)', () => {
  // A hand-written line parser read "### Watch" as part of the first list, so
  // the page's second list (facts) got the bill list's decision: "Only a few
  // pass" was drawn as H.R. 7022's card.
  const markdown = '### Passed\n- Most bills die in committee\n### Watch\n- Only a few pass\n\nBills to watch:\n\n- H.R. 7022 [1]\n- H.R. 952 [2]';
  const lists = specs(markdown);
  assert.deepEqual(lists.map((l) => l?.ids ?? null), [null, null, ['7022hr119', '952hr119']]);
  const facts1 = el('ul', el('li', text('Most bills die in committee')));
  const facts2 = el('ul', el('li', text('Only a few pass')));
  const billList = el('ul', el('li', text('H.R. 7022 [1]')), el('li', text('H.R. 952 [2]')));
  run(el('div', el('h3', text('Passed')), facts1, el('h3', text('Watch')), facts2, el('p', text('Bills to watch:')), billList), lists);
  assert.equal(facts1.properties.dataCards, undefined);
  assert.equal(facts2.properties.dataCards, undefined);
  assert.equal(billList.properties.dataCards, true);
});

it('reads lists exactly where markdown ends them: a rule, a quote, a numbered line inside a paragraph', () => {
  assert.deepEqual(specs('- H.R. 7022 [1]\n\n* * *\n\n- first fact\n- second fact').map((l) => l?.ids ?? null), [['7022hr119'], null]);
  assert.deepEqual(specs('Two things\n2. foo\n\n- H.R. 7022 [1]').map((l) => l?.ids ?? null), [['7022hr119']]);
  assert.deepEqual(specs('- H.R. 7022 [1]\n> a quote\n\n- H.R. 1 cuts taxes [5]').length, 2);
});

it('finds where the first list starts, so the reveal can wait there for the sources', () => {
  const text = 'The newest laws:\n\n- H.R. 7022 [1]\n- H.R. 952 [2]\n\nMore after.';
  assert.equal(firstListStart(text), text.indexOf('- H.R. 7022'));
  assert.equal(firstListStart('No list here.\n\nNone at all.'), null);
  // A quoted list is not a top-level list: nothing there becomes cards.
  assert.equal(firstListStart('> - quoted'), null);
});

it('matches lists by order, and skips lists nested in an item or a quote', () => {
  const first = el('ul', el('li', text('H.R. 1 cuts taxes. [5]')));
  const quoted = el('blockquote', el('ul', el('li', text('H.R. 3620 [3]'))));
  const second = el('ol', el('li', text('H.R. 7022 [1]')));
  run(el('div', first, quoted, second), specs('- H.R. 1 cuts taxes. [5]\n\n> - H.R. 3620 [3]\n\n1. H.R. 7022 [1]'));
  assert.equal(first.properties.dataCards, undefined);
  assert.equal((quoted.children[0] as El).properties.dataCards, undefined);
  assert.equal(second.properties.dataCards, true);
});

it('leaves a list that is not a list of bills as text, with each bill linked', () => {
  const li = el('li', text('H.R. 7022 and H.R. 952 were signed the same day.'));
  const ul = el('ul', li);
  run(el('div', ul), [null]);
  assert.equal(ul.properties.dataCards, undefined);
  assert.deepEqual(links(li).map((a) => a.properties.href), ['/bills/7022hr119', '/bills/952hr119']);
});

it('links a name once per paragraph, but every citation', () => {
  const p = el('p', text('The Mystic Alerts Act [1] is H.R. 7022 [1].'));
  run(el('div', p));
  assert.deepEqual(
    links(p).map((a) => [a.properties.dataMention, (a.children[0] as { value: string }).value]),
    [['name', 'Mystic Alerts Act'], ['cite', '[1]'], ['cite', '[1]']],
  );
});

it('does not link a citation of a non-bill, or inside code or an existing link', () => {
  const p = el('p', text('138 laws. [4] '), el('code', text('H.R. 7022')), el('a', text('H.R. 952')));
  run(el('div', p));
  assert.equal(p.children.length, 3);
});

it('keeps the text and its offsets intact, so the word-by-word reveal still lines up', () => {
  const p = el('p', text('See H.R. 7022 now.', 100));
  run(el('div', p));
  const flat = (n: Node): string => (n.type === 'text' ? n.value : n.children.map(flat).join(''));
  assert.equal(flat(p), 'See H.R. 7022 now.');
  const after = p.children[2] as { position?: { start: { offset?: number } } };
  assert.equal(after.position?.start.offset, 113);
});

// ── Real answers ────────────────────────────────────────────────────────────
// Twelve answers captured from the live engine on 2026-10-26, each with what its
// lists must become. The model words the same list a different way every
// time; these are the ways it actually has.

const real = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'answer-bill-links.real-answers.json'), 'utf8'),
) as {
  answers: {
    name: string;
    question: string;
    expect: 'cards' | 'text';
    content: string;
    sources: string[];
    allowed: string[];
    entities: Record<string, Record<string, unknown>>;
  }[];
};
for (const a of real.answers) {
  it(`real answer "${a.question}" → ${a.expect === 'cards' ? 'its list becomes cards' : 'its lists stay text'}`, () => {
    const got = cardListBills(a.content, answerBills(a.sources, a.allowed, a.entities));
    if (a.expect === 'cards') assert.ok(got.size >= 2, `expected cards, got ${[...got]}`);
    else assert.deepEqual([...got], []);
  });
}

console.log(`\nanswer-bill-links: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
