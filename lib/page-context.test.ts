/**
 * Tests for lib/page-context.ts — what the reader has open, as the answer
 * engine sees it.
 *
 * Two of these are regressions rather than new behaviour. The route logic used
 * to treat any single segment under `/bills/` as a bill id, so the seven hub
 * pages both reported the wrong analytics `surface` and handed the model a
 * focus bill of `"enacted"` / `"house"` / `"in-committee"` — which the system
 * prompt then stated as fact. Both are asserted below by name.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { billIdFor, pageContextFor, routeFor, surfaceFor } from './page-context';

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

it('names the home page', () => {
  assert.equal(routeFor('/'), 'home');
  assert.equal(surfaceFor('/'), 'home');
});

it('names the bills list', () => {
  assert.equal(routeFor('/bills'), 'list');
  assert.equal(routeFor('/bills/'), 'list');
  assert.equal(surfaceFor('/bills'), 'filtered');
});

it('names a bill page and reads its id', () => {
  assert.equal(routeFor('/bills/1234hr119'), 'bill');
  assert.equal(billIdFor('/bills/1234hr119'), '1234hr119');
  assert.equal(surfaceFor('/bills/1234hr119'), 'bill');
});

it('treats hub slugs as browse pages, not bills', () => {
  // Regression: these seven routes reported surface 'bill' on every answer event.
  for (const path of ['/bills/enacted', '/bills/house', '/bills/senate', '/bills/in-committee']) {
    assert.equal(routeFor(path), 'hub', path);
    assert.equal(surfaceFor(path), 'filtered', path);
  }
  assert.equal(routeFor('/bills/topic/health'), 'hub');
  assert.equal(surfaceFor('/bills/topic/health'), 'filtered');
});

it('never mistakes a hub slug for a bill id', () => {
  // Regression: the system prompt used to assert "the reader is looking at
  // bill enacted", which is not a bill and cannot be looked up.
  for (const path of ['/bills/enacted', '/bills/house', '/bills/topic/health', '/bills/abc']) {
    assert.equal(billIdFor(path), undefined, path);
  }
});

it('rejects a bill id that is not shaped like one', () => {
  assert.equal(billIdFor('/bills/1234HR119'), undefined); // uppercase
  assert.equal(billIdFor('/bills/hr1234'), undefined); // no leading number
  assert.equal(billIdFor('/bills/1234hr119/actions'), undefined); // deeper path
  assert.equal(billIdFor('/bills/../etc'), undefined);
});

it('names the learn guide and everything else', () => {
  assert.equal(routeFor('/learn'), 'learn');
  assert.equal(surfaceFor('/learn'), 'other');
  assert.equal(routeFor('/account'), 'other');
  assert.equal(routeFor('/about'), 'other');
  assert.equal(surfaceFor('/account'), 'other');
});

it('ignores a query string or hash on the path', () => {
  assert.equal(routeFor('/bills?policyArea=Health'), 'list');
  assert.equal(billIdFor('/bills/1234hr119?from=answer'), '1234hr119');
  assert.equal(billIdFor('/bills/1234hr119#actions'), '1234hr119');
});

it('carries a published Congress through', () => {
  assert.equal(pageContextFor('/', { congress: 117 }).congress, 117);
  assert.equal(pageContextFor('/bills', { congress: 119 }).congress, 119);
});

it('drops a Congress number that could not be real', () => {
  for (const congress of [0, -1, 1.5, 9999, Number.NaN] as number[]) {
    assert.equal(pageContextFor('/', { congress }).congress, undefined, String(congress));
  }
  assert.equal(pageContextFor('/', {}).congress, undefined);
  assert.equal(pageContextFor('/', null).congress, undefined);
});

it('lets the path win over a stale published context', () => {
  // A reader moving from the 117th dashboard onto a 119th bill must not have
  // the previous page's Congress relabel the bill in front of them.
  const ctx = pageContextFor('/bills/1234hr119', { congress: 117 });
  assert.equal(ctx.route, 'bill');
  assert.equal(ctx.billId, '1234hr119');
});

it('never emits null or undefined into the payload', () => {
  const json = JSON.stringify(pageContextFor('/bills/enacted', { congress: undefined }));
  assert.ok(!json.includes('null'));
  assert.ok(!json.includes('undefined'));
});

console.log(`\npage-context: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
