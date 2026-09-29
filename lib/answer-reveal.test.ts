/**
 * The paced reveal of an answer (lib/answer-reveal.ts).
 *
 * What these guard: the reveal only ever shows a prefix of the real answer,
 * it never stops somewhere that renders as broken markdown, and it always ends
 * on the exact text the server sent.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import {
  REVEAL_MAX_MS,
  REVEAL_WORDS_PER_SECOND,
  healPartialMarkdown,
  rehypeWordSpans,
  revealCount,
  revealStops,
  revealedText,
} from './answer-reveal';

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

const every = (text: string) => {
  const stops = revealStops(text);
  return stops.map((_, i) => revealedText(text, stops, i + 1));
};

it('ends on exactly the text the server sent', () => {
  const text = 'H.R. 1 **became law** on March 3.\n\n- One\n- Two [[bills:1hr119]]\n';
  const stops = revealStops(text);
  assert.equal(revealedText(text, stops, stops.length), text);
  assert.equal(revealedText(text, stops, stops.length + 5), text);
});

it('shows nothing before the first word', () => {
  const stops = revealStops('Hello there');
  assert.equal(revealedText('Hello there', stops, 0), '');
});

it('never shows half an entity directive', () => {
  const text = 'See these bills: [[bills:1hr119,2s119]] and more.';
  for (const shown of every(text)) {
    const opens = (shown.match(/\[\[/g) ?? []).length;
    const closes = (shown.match(/\]\]/g) ?? []).length;
    assert.equal(opens, closes, `half a directive on screen: ${shown}`);
  }
});

it('never shows half a link', () => {
  const text = 'Read [the full text on Congress.gov](https://congress.gov/x) for detail.';
  for (const shown of every(text)) {
    assert.ok(!/\[[^\]]*$/.test(shown) && !/\]\([^)]*$/.test(shown), `half a link: ${shown}`);
  }
});

it('never stops on a bare list bullet, which would render a heading', () => {
  const text = 'Two bills passed:\n- H.R. 1\n- S. 2';
  for (const shown of every(text)) {
    assert.ok(!/\n-$/.test(shown), `stopped on a bare bullet: ${JSON.stringify(shown)}`);
  }
});

it('closes bold the cut left open', () => {
  assert.equal(healPartialMarkdown('It **became law'), 'It **became law**');
  assert.equal(healPartialMarkdown('It **became law** today'), 'It **became law** today');
  assert.equal(healPartialMarkdown('It *may'), 'It *may*');
  assert.equal(healPartialMarkdown('**Status: *pending'), '**Status: *pending***');
  assert.equal(healPartialMarkdown('* a list item'), '* a list item');
});

it('paces short answers at the base rate and long ones within the cap', () => {
  assert.equal(revealCount(1000, 0), 0);
  assert.equal(revealCount(100, 1000), REVEAL_WORDS_PER_SECOND);
  assert.equal(revealCount(1000, REVEAL_MAX_MS), 1000);
  assert.equal(revealCount(10, 60_000), 10);
});

it('wraps each word in its own span, leaving code alone', () => {
  const tree = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [
          { type: 'text', value: 'Two words ' },
          { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: 'a b' }] },
        ],
      },
    ],
  };
  rehypeWordSpans()(tree);
  const p = tree.children[0];
  assert.deepEqual(
    p.children.map((c) => ('tagName' in c ? c.tagName : JSON.stringify((c as { value: string }).value))),
    ['span', '" "', 'span', '" "', 'code'],
  );
  assert.equal((p.children[4] as { children: unknown[] }).children.length, 1);
});

console.log(`\nanswer-reveal: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
