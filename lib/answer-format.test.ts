/**
 * Turning provenance handles into the printed source apparatus (spec §7.2).
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { toSource, toSources } from './answer-format';

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

console.log(`\nanswer-format: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
