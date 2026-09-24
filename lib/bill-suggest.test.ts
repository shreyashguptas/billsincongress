/**
 * Instant bill suggestions under the home ask box.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import {
  initialHighlight,
  isSettled,
  moveHighlight,
  suggestKey,
  suggestKind,
} from './bill-suggest';

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

// Real entries from the home ask box, 19–23 Sep 2026.
it('treats the bill references readers typed as number lookups', () => {
  for (const q of ['HR 979', 'H.R. 7638', 'hr 9319', 's. 1032', 'S.1426', 'hr8500', '5025']) {
    assert.equal(suggestKind(q), 'number', q);
  }
});

it('treats short topic searches as title searches', () => {
  for (const q of ['broadband', 'Sunshine act', 'climate change', 'Flock camera', 'data center']) {
    assert.equal(suggestKind(q), 'title', q);
  }
});

it('recognises acronyms whose bills never spell them out', () => {
  assert.equal(suggestKind('KOSA'), 'acronym');
  assert.equal(suggestKind('ndaa'), 'acronym');
});

it('does not search on one letter, but does on a one-digit bill number', () => {
  assert.equal(suggestKind(''), null);
  assert.equal(suggestKind('  '), null);
  assert.equal(suggestKind('a'), null);
  assert.equal(suggestKind('5'), 'number');
});

it('keys spacing and case variants together', () => {
  assert.equal(suggestKey('  HR   979 '), suggestKey('hr 979'));
});

it('moves the highlight down from nothing to the first row, and off the end back to nothing', () => {
  assert.equal(moveHighlight(-1, 1, 3), 0);
  assert.equal(moveHighlight(0, 1, 3), 1);
  assert.equal(moveHighlight(2, 1, 3), -1);
});

it('moves the highlight up from nothing to the last row, and off the top back to nothing', () => {
  assert.equal(moveHighlight(-1, -1, 3), 2);
  assert.equal(moveHighlight(0, -1, 3), -1);
});

it('never highlights a row when there are none', () => {
  assert.equal(moveHighlight(-1, 1, 0), -1);
  assert.equal(moveHighlight(4, -1, 0), -1);
});

it('pre-selects only a bill reference that found exactly one bill', () => {
  assert.equal(initialHighlight('number', 1), 0);
  assert.equal(initialHighlight('number', 3), -1);
  assert.equal(initialHighlight('title', 1), -1);
  assert.equal(initialHighlight('acronym', 1), -1);
  assert.equal(initialHighlight(null, 0), -1);
});

// Review of #111: with "broadband" still typed, switching the masthead from the
// 119th to the 117th left the 119th's rows counted as current and pickable.
it('does not treat another Congress\'s results as current for the same text', () => {
  const from119 = { forQuery: 'broadband', forCongress: 119 };
  assert.equal(isSettled(from119, 'broadband', 119), true);
  assert.equal(isSettled(from119, 'broadband', 117), false);
});

it('treats a result as current only for the text it answered', () => {
  const r = { forQuery: 'hr 979', forCongress: 119 };
  assert.equal(isSettled(r, '  HR   979 ', 119), true);
  assert.equal(isSettled(r, 'hr 97', 119), false);
  assert.equal(isSettled({ forQuery: '', forCongress: null }, '', 119), false);
});

console.log(`\nbill-suggest: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
