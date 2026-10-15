/**
 * The sitemap never answers "OK" with less than the whole site.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { billLastModified, sitemapFileUrl, sitemapIds } from './sitemap-ids';

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

it('lists the static file first, then every congress', () => {
  assert.deepEqual(sitemapIds([119, 118, 117]), [0, 119, 118, 117]);
});

// Google read the index on 23 Jun 2026, got "Success, 0 discovered pages" and
// did not come back for three months. A failed or empty lookup used to fall
// back to [0]: a successful index with no bills in it.
it('refuses to publish an index without any congress', () => {
  assert.throws(() => sitemapIds([]));
  assert.throws(() => sitemapIds(null));
  assert.throws(() => sitemapIds(undefined));
});

it('refuses congress numbers that could not name a real sitemap', () => {
  assert.throws(() => sitemapIds([119, 0]));
  assert.throws(() => sitemapIds([119, -1]));
  assert.throws(() => sitemapIds([119, 118.5]));
  assert.throws(() => sitemapIds(['119']));
});

// Google ignores lastmod it cannot trust, and ours was the row's updatedAt:
// 14,547 of the 119th's 19,649 bills shared 2026-08-01, a backfill's date.
it('dates a bill by its latest action, else its introduction, never a write', () => {
  assert.equal(billLastModified({ latestActionDate: '2026-07-23', introducedDate: '2025-01-03' }), '2026-07-23');
  assert.equal(billLastModified({ latestActionDate: null, introducedDate: '2025-01-03' }), '2025-01-03');
  assert.equal(billLastModified({ latestActionDate: '2026-07-23T14:00:00Z' }), '2026-07-23');
  assert.equal(billLastModified({ latestActionDate: '', introducedDate: 'not a date' }), undefined);
  assert.equal(billLastModified({}), undefined);
});

// The protocol scopes a sitemap to its own folder: /sitemap/119.xml listing
// /bills/... pages is outside it.
it('serves every sitemap file from the site root', () => {
  assert.equal(sitemapFileUrl('https://billsincongress.com', 119), 'https://billsincongress.com/sitemap-119.xml');
  assert.equal(sitemapFileUrl('https://billsincongress.com', 0), 'https://billsincongress.com/sitemap-0.xml');
});

console.log(`\nsitemap-ids: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
