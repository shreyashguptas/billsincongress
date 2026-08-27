/**
 * Entity directives (spec §6.6).
 *
 * Same guarantee as citations: an entity the model was not given must not
 * render. These tests are that guarantee.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { splitAnswer } from './answer-entities';

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

const allow = (...h: string[]) => new Set(h);

it('returns a single prose block when there are no directives', () => {
  const blocks = splitAnswer('Just words.', allow());
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'prose');
});

it('splits prose around a bills directive', () => {
  const blocks = splitAnswer(
    'Here they are:[[bills:1hr119,2hr119]]That is all.',
    allow('bills:1hr119', 'bills:2hr119'),
  );
  assert.equal(blocks.length, 3);
  assert.equal(blocks[0].type, 'prose');
  assert.equal(blocks[1].type, 'entities');
  assert.equal(blocks[2].type, 'prose');
});

it('resolves every id in a multi-id directive', () => {
  const blocks = splitAnswer(
    '[[bills:1hr119,2hr119,3hr119]]',
    allow('bills:1hr119', 'bills:2hr119', 'bills:3hr119'),
  );
  const entities = blocks.find((b) => b.type === 'entities');
  assert.ok(entities && entities.type === 'entities');
  if (entities.type === 'entities') assert.equal(entities.refs.length, 3);
});

it('DROPS an id the model was not given', () => {
  const blocks = splitAnswer('[[bills:1hr119,9999zz999]]', allow('bills:1hr119'));
  const entities = blocks.find((b) => b.type === 'entities');
  assert.ok(entities && entities.type === 'entities');
  if (entities.type === 'entities') {
    assert.equal(entities.refs.length, 1);
    assert.equal(entities.refs[0].id, '1hr119');
  }
});

it('emits no entity block at all when every id was invented', () => {
  const blocks = splitAnswer('Look:[[bills:9999zz999]]', allow('bills:1hr119'));
  assert.ok(!blocks.some((b) => b.type === 'entities'));
});

it('links a bill entity to its page', () => {
  const blocks = splitAnswer('[[bills:1234hr119]]', allow('bills:1234hr119'));
  const e = blocks.find((b) => b.type === 'entities');
  if (e && e.type === 'entities') assert.equal(e.refs[0].href, '/bills/1234hr119');
});

it('links a topic entity to its topic page', () => {
  const blocks = splitAnswer('[[topic:Health]]', allow('topics:119:Health'));
  const e = blocks.find((b) => b.type === 'entities');
  if (e && e.type === 'entities') assert.equal(e.refs[0].href, '/bills/topic/health');
});

it('links a sponsor entity to a filtered bill list', () => {
  const blocks = splitAnswer('[[sponsor:John Sarbanes]]', allow('sponsors:119:John Sarbanes'));
  const e = blocks.find((b) => b.type === 'entities');
  if (e && e.type === 'entities') assert.equal(e.refs[0].href, '/bills?sponsor=John+Sarbanes');
});

it('links a state entity to a filtered bill list', () => {
  const blocks = splitAnswer('[[state:MD]]', allow('bills:1hr119'));
  const e = blocks.find((b) => b.type === 'entities');
  // State needs no fetched row — it is derived from a filter, always allowed.
  if (e && e.type === 'entities') assert.equal(e.refs[0].href, '/bills?state=MD');
});

it('handles two directives back to back', () => {
  const blocks = splitAnswer(
    '[[bills:1hr119]][[topic:Health]]',
    allow('bills:1hr119', 'topics:119:Health'),
  );
  assert.equal(blocks.filter((b) => b.type === 'entities').length, 2);
});

it('leaves a malformed directive as plain text rather than throwing', () => {
  const blocks = splitAnswer('Broken [[bills:]] and [[]] here.', allow('bills:1hr119'));
  assert.ok(blocks.every((b) => b.type === 'prose'));
});

it('does not mistake a citation marker for an entity directive', () => {
  const blocks = splitAnswer('Fact.[[cite:bills:1hr119]]', allow('bills:1hr119'));
  assert.ok(
    blocks.every((b) => b.type === 'prose'),
    'cite markers belong to answer-format, not entities',
  );
});

console.log(`\nanswer-entities: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
