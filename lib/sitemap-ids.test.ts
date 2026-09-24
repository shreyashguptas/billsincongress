/**
 * The sitemap never answers "OK" with less than the whole site.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { sitemapIds } from './sitemap-ids';

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

console.log(`\nsitemap-ids: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
