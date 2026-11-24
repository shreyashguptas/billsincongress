/**
 * Tests for how the header search reaches its results (lib/header-search.ts).
 *
 * The case that matters is the first one: a header search typed while already
 * on /bills. It used to be a router navigation, which left the previous
 * search's list on screen until the server had rendered the whole page again
 * (1–4 s, 24 s once), and readers searched again (PostHog Inbox report
 * 01a18369). On /bills it must update the list in place.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { headerSearchHref, headerSearchMove } from './header-search';

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

const at = (url: string) => {
  const u = new URL(url, 'https://billsincongress.com');
  return { pathname: u.pathname, search: u.search };
};

// The reader's six searches from the recorded session, one after another on /bills.
it('updates the list in place for every new search typed while on /bills', () => {
  const searches = ['10775', '10560', '10807', '10809', '5676', '10803'];
  let here = at('/bills?title=10803');
  for (const q of searches) {
    const href = headerSearchHref(q);
    assert.equal(headerSearchMove(here, href), 'in-place', `searching ${q} from ${here.search}`);
    here = at(href);
  }
});

it('updates in place from the bare list and from a filtered one', () => {
  assert.equal(headerSearchMove(at('/bills'), headerSearchHref('lumber')), 'in-place');
  assert.equal(
    headerSearchMove(at('/bills?status=100&congress=119&page=2'), headerSearchHref('H1B')),
    'in-place',
  );
  // An empty search from a filtered list clears it, as the old navigation did.
  assert.equal(headerSearchMove(at('/bills?title=visa'), headerSearchHref('')), 'in-place');
});

it('stays put when the list already shows that search, however the URL spells it', () => {
  // The list writes spaces as "+", the header as "%20".
  assert.equal(
    headerSearchMove(at('/bills?title=freedom+of+speech'), headerSearchHref('freedom of speech')),
    'stay',
  );
  assert.equal(headerSearchMove(at('/bills'), headerSearchHref('   ')), 'stay');
});

it('navigates from every other page, including the /bills hub pages and bill pages', () => {
  for (const page of ['/', '/account', '/bills/house', '/bills/5620s119', '/learn']) {
    assert.equal(headerSearchMove(at(page), headerSearchHref('10803')), 'navigate', page);
  }
});

it('builds the same /bills?title= URL the header has always used', () => {
  assert.equal(headerSearchHref('  S. 2878 '), '/bills?title=S.%202878');
  assert.equal(headerSearchHref(''), '/bills');
});

console.log(`header-search: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
