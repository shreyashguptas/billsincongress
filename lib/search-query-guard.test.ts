/**
 * Search-query reformulation (spec §4.6).
 *
 * This is the strongest privacy control in the design: the reader's own words
 * never leave our servers, so there is no promise-not-to-retain to rely on.
 * A failure here is a privacy regression, not a formatting one.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { checkSearchQuery } from './search-query-guard';

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

const Q = 'I live in Maryland — what is my rep doing about veteran housing?';

it('accepts a neutral factual query', () => {
  assert.equal(
    checkSearchQuery('Maryland congressional delegation veteran housing legislation 2026', Q).ok,
    true,
  );
});

it("rejects first-person 'I'", () => {
  assert.equal(checkSearchQuery('what I should know about veteran housing', Q).ok, false);
});

it("rejects possessive 'my'", () => {
  assert.equal(checkSearchQuery('my representative veteran housing', Q).ok, false);
});

it("rejects 'we' and 'our'", () => {
  assert.equal(checkSearchQuery('our district housing bills', Q).ok, false);
  assert.equal(checkSearchQuery('we need housing help', Q).ok, false);
});

it('is not fooled by capitalisation', () => {
  assert.equal(checkSearchQuery('My Representative housing', Q).ok, false);
});

it('is not fooled by surrounding punctuation', () => {
  assert.equal(checkSearchQuery('housing (my district), 2026', Q).ok, false);
});

it("rejects verbatim pass-through of the reader's question", () => {
  assert.equal(checkSearchQuery(Q, Q).ok, false);
});

it('rejects a near-verbatim pass-through', () => {
  assert.equal(checkSearchQuery(Q.replace('—', '-').trim(), Q).ok, false);
});

it('does not reject words that merely contain a pronoun', () => {
  // "Imports", "Wyoming", "Miami" contain i/my/mi sequences.
  assert.equal(checkSearchQuery('Imports tariffs Wyoming Miami hearings', Q).ok, true);
});

it('rejects an empty query', () => {
  assert.equal(checkSearchQuery('   ', Q).ok, false);
});

it('gives an error the model can act on', () => {
  const r = checkSearchQuery('my rep housing', Q);
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.ok(
      r.error.toLowerCase().includes('rephrase') || r.error.toLowerCase().includes('neutral'),
    );
});

console.log(`\nsearch-query-guard: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
