/**
 * Mapping the bills-list filter state onto a catalog scope (spec §6.3).
 *
 * The label is reader-facing ("health bills in committee"), so it must read as
 * English, not as a filter dump.
 *
 * Input property names come from `app/bills/filter-signature.ts`, which is what
 * the list page actually holds — note `status` carries the stage CODE and
 * `'all'` is the not-set sentinel.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { VALID_STAGES } from '../convex/catalog/filters';
import { ALL_HUBS, hubByPath } from './hubs';
import { CATALOG_STAGES, scopeFromFilters, scopeFromHub } from './answer-scope';

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

it('returns null when nothing but congress is set', () => {
  // An unfiltered list is not a scope worth pre-applying.
  assert.equal(scopeFromFilters({ congress: '119' }), null);
});

it("returns null when every filter is at its 'all' sentinel", () => {
  assert.equal(
    scopeFromFilters({ status: 'all', state: 'all', policyArea: 'all', billType: 'all' }),
    null,
  );
});

it('maps a policy area', () => {
  const s = scopeFromFilters({ congress: '119', policyArea: 'Health' });
  assert.ok(s);
  assert.equal(s?.filters.policyArea, 'Health');
  assert.equal(s?.filters.congress, 119);
});

it("maps status to the catalog's progressStage filter name", () => {
  const s = scopeFromFilters({ congress: '119', status: '40' });
  assert.equal(s?.filters.progressStage, 40);
});

it('maps sponsors into the array form the catalog expects', () => {
  const s = scopeFromFilters({ congress: '119', sponsor: ['John Sarbanes'] });
  assert.deepEqual(s?.filters.sponsorFilter, ['John Sarbanes']);
});

it('maps a state', () => {
  assert.equal(scopeFromFilters({ congress: '119', state: 'MD' })?.filters.sponsorState, 'MD');
});

it('combines several filters', () => {
  const s = scopeFromFilters({ congress: '119', policyArea: 'Health', status: '40' });
  assert.equal(s?.filters.policyArea, 'Health');
  assert.equal(s?.filters.progressStage, 40);
});

it('writes a readable label for a topic and stage', () => {
  const s = scopeFromFilters({ congress: '119', policyArea: 'Health', status: '40' });
  assert.ok(s?.label.toLowerCase().includes('health'));
  assert.ok(s?.label.toLowerCase().includes('committee'));
});

it('writes a readable label for a state', () => {
  assert.ok(scopeFromFilters({ congress: '119', state: 'MD' })?.label.includes('MD'));
});

it('never emits undefined into the label', () => {
  const s = scopeFromFilters({
    congress: '119',
    policyArea: 'Health',
    sponsor: ['John Sarbanes'],
    state: 'MD',
  });
  assert.ok(!s?.label.includes('undefined'));
});

it('drops empty-string filters rather than passing them through', () => {
  const s = scopeFromFilters({ congress: '119', policyArea: '', state: 'MD' });
  assert.equal(s?.filters.policyArea, undefined);
});

it('drops an empty sponsor array rather than treating it as a filter', () => {
  assert.equal(scopeFromFilters({ congress: '119', sponsor: [] }), null);
});

it('maps a title search to titleFilter', () => {
  const s = scopeFromFilters({ congress: '119', title: 'veterans housing' });
  assert.equal(s?.filters.titleFilter, 'veterans housing');
  assert.ok(s?.label.includes('veterans housing'));
});

it('maps a chamber, which the catalog validates as house or senate', () => {
  const s = scopeFromFilters({ congress: '119', chamber: 'senate' });
  assert.equal(s?.filters.chamber, 'senate');
  assert.ok(s?.label.includes('Senate'), `label was "${s?.label}"`);
});

it('does not treat a chamber sentinel as a filter', () => {
  assert.equal(scopeFromFilters({ congress: '119', chamber: 'all' }), null);
});

it('keeps the stage list in step with the catalog that has to accept it', () => {
  // Imported from the catalog itself rather than duplicated: these two lists
  // disagreed once, and the symptom was an "Ask about these" on a vetoed list
  // silently answering about every bill in the Congress.
  assert.deepEqual([...CATALOG_STAGES].sort(), [...VALID_STAGES].sort());
});

it('builds a scope for a chamber hub', () => {
  const s = scopeFromHub(hubByPath('/bills/house')!);
  assert.equal(s?.filters.chamber, 'house');
  assert.equal(s?.label, 'house bills');
});

it('builds a scope for a topic hub', () => {
  const s = scopeFromHub(hubByPath('/bills/topic/health')!);
  assert.equal(s?.filters.policyArea, 'Health');
});

it('coerces a hub stage to the number the catalog requires', () => {
  const s = scopeFromHub(hubByPath('/bills/enacted')!);
  // A string here is rejected outright by convex/catalog/filters.ts, which is
  // why this is a coercion and not a formality.
  assert.equal(typeof s?.filters.progressStage, 'number');
  assert.equal(s?.filters.progressStage, 100);
});

it('builds an applicable scope for every hub the site publishes', () => {
  for (const hub of ALL_HUBS) {
    const s = scopeFromHub(hub);
    assert.ok(s, `no scope for ${hub.path}`);
    assert.ok(s.label.length > 0, `empty label for ${hub.path}`);
    const stage = s.filters.progressStage;
    if (stage !== undefined) {
      assert.ok(VALID_STAGES.includes(stage as number), `${hub.path} stage ${String(stage)}`);
    }
  }
});

it('keeps the vetoed list answerable rather than silently unscoped', () => {
  // /bills/vetoed and the list page's "Vetoed" filter both use stage 85.
  assert.equal(scopeFromHub(hubByPath('/bills/vetoed')!)?.filters.progressStage, 85);
  assert.equal(scopeFromFilters({ congress: '119', status: '85' })?.filters.progressStage, 85);
});

console.log(`\nanswer-scope: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
