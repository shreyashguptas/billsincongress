/**
 * The /bills Sort menu: which orders a filter set offers, its default, and that
 * the URL carries a pick only when it is not the default.
 *
 * The request behind it: with Outcome set to "Became law", a reader wanted the
 * newest laws first. /bills listed them in the order our database stored them,
 * with no way to change it.
 */
import assert from 'node:assert/strict';
import { DEFAULT_FILTER_VALUES, filterSignature } from '@/app/bills/filter-signature';
import { buildFilterQuery, filtersFromQuery } from './filter-url';
import { defaultSort, effectiveSort, sortDateLabel, sortOptions } from './sort';

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

const base = DEFAULT_FILTER_VALUES;
const laws = { ...base, status: '100' };

it('lists the newest laws first under Outcome: Became law, with no sort in the URL', () => {
  assert.equal(defaultSort(laws), 'stage');
  assert.equal(buildFilterQuery(laws), '?status=100');
  assert.equal(sortDateLabel('stage', '100'), 'Became law');
  assert.deepEqual(
    sortOptions(laws).map((o) => o.label),
    ['Date became law', 'Latest action', 'Date introduced'],
  );
});

it('defaults an unfiltered list to latest action, and offers no stage date', () => {
  assert.equal(defaultSort(base), 'latestAction');
  assert.ok(!sortOptions(base).some((o) => o.value === 'stage'));
});

it('defaults a title search to best match', () => {
  const search = { ...base, title: 'veterans' };
  assert.equal(defaultSort(search), 'relevance');
  assert.equal(sortOptions(search)[0].value, 'relevance');
});

it('defaults "Just introduced" to the introduced date', () => {
  assert.equal(defaultSort({ ...base, status: '20' }), 'introduced');
});

it('round-trips a pick that is not the default through the URL', () => {
  const pick = { ...laws, sort: 'latestAction' };
  const query = buildFilterQuery(pick);
  assert.equal(query, '?status=100&sort=latestAction');
  assert.equal(effectiveSort(filtersFromQuery(query)), 'latestAction');
});

it('falls back to the default when the filters stop offering the pick', () => {
  // "Date became law" picked, then the Outcome filter removed.
  const cleared = { ...base, sort: 'stage' };
  assert.equal(effectiveSort(cleared), 'latestAction');
  assert.equal(buildFilterQuery(cleared), '');
  assert.equal(filterSignature(cleared), filterSignature(base));
});

it('ignores a sort value it does not know', () => {
  assert.equal(filtersFromQuery('?sort=popular').sort, '');
});

it('changes the signature when the order changes, so the list refetches', () => {
  assert.notEqual(
    filterSignature(laws),
    filterSignature({ ...laws, sort: 'introduced' }),
  );
});

if (failures.length > 0) {
  console.error(`sort: ${failures.length} failed, ${passed} passed\n${failures.join('\n')}`);
  process.exit(1);
}
console.log(`sort: ${passed} passed`);
