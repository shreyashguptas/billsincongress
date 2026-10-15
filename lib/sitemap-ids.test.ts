/**
 * The sitemap never answers "OK" with less than the whole site.
 *
 * Run with: `pnpm test`.
 */
import assert from 'node:assert/strict';
import { billLastModified, listedSitemapIds, servedSitemapChunk, sitemapChunk, sitemapFileUrl, sitemapIds, urlsetXml } from './sitemap-ids';

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

it('builds the static file, then all eight quarters of every congress', () => {
  assert.deepEqual(sitemapIds([119, 118]), [0, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198, 1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188]);
});

// Google read the small files and recorded "Sitemap could not be read" for
// every 1.7-1.9 MB one-file-per-Congress sitemap (14-15 Oct 2026).
it('lists only the quarters that have begun', () => {
  assert.deepEqual(listedSitemapIds([119], '2026-10-15'), [0, 1191, 1192, 1193, 1194, 1195, 1196, 1197, 1198]);
  assert.deepEqual(listedSitemapIds([119], '2025-05-20'), [0, 1191, 1192]);
  assert.deepEqual(listedSitemapIds([119], '2025-04-01'), [0, 1191, 1192]);
  assert.deepEqual(listedSitemapIds([119], '2025-03-31'), [0, 1191]);
});

it('maps a file to its quarter, with open ends so no bill falls outside every file', () => {
  assert.deepEqual(sitemapChunk(1191), { congress: 119, quarter: 1, from: '2025-01-01', introducedFrom: '', introducedBefore: '2025-04-01' });
  assert.deepEqual(sitemapChunk(1194), { congress: 119, quarter: 4, from: '2025-10-01', introducedFrom: '2025-10-01', introducedBefore: '2026-01-01' });
  assert.deepEqual(sitemapChunk(1195), { congress: 119, quarter: 5, from: '2026-01-01', introducedFrom: '2026-01-01', introducedBefore: '2026-04-01' });
  // Six bills were introduced on 1-2 January after their Congress's second year.
  assert.deepEqual(sitemapChunk(1178), { congress: 117, quarter: 8, from: '2022-10-01', introducedFrom: '2022-10-01', introducedBefore: null });
  // Consecutive quarters meet exactly: each one starts where the last ended.
  for (let q = 1; q < 8; q++) {
    assert.equal(sitemapChunk(1180 + q).introducedBefore, sitemapChunk(1181 + q).introducedFrom);
  }
});

it('refuses an id that names no quarter', () => {
  for (const id of [119, 1190, 1199, 0, -1191, 1191.5]) assert.throws(() => sitemapChunk(id), `${id}`);
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
  assert.equal(sitemapFileUrl('https://billsincongress.com', 1191), 'https://billsincongress.com/sitemap-1191.xml');
  assert.equal(sitemapFileUrl('https://billsincongress.com', 0), 'https://billsincongress.com/sitemap-0.xml');
});

// The 120th Congress starts in January 2027. Its files must exist from the day
// its bills do, with no deploy: Next's generateSitemaps answered 404 for any id
// not known at build time.
it('serves a quarter of any Congress we hold, and 404s everything else', () => {
  assert.deepEqual(servedSitemapChunk('1191', [119, 118]), sitemapChunk(1191));
  assert.deepEqual(servedSitemapChunk('1201', [120, 119]), sitemapChunk(1201));
  assert.equal(servedSitemapChunk('1201', [119, 118]), null); // no bills for the 120th yet
  for (const raw of ['119', '1190', '1199', 'abc', '01191', '1191.5', '', '-1191']) {
    assert.equal(servedSitemapChunk(raw, [119]), null, raw);
  }
});

it('writes a sitemaps.org urlset, with lastmod only where a date is known', () => {
  assert.equal(
    urlsetXml([{ loc: 'https://billsincongress.com/' }, { loc: 'https://billsincongress.com/bills/1hr119', lastmod: '2026-10-13' }]),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      '<url>\n<loc>https://billsincongress.com/</loc>\n</url>\n' +
      '<url>\n<loc>https://billsincongress.com/bills/1hr119</loc>\n<lastmod>2026-10-13</lastmod>\n</url>\n</urlset>\n',
  );
  assert.match(urlsetXml([{ loc: 'https://x.test/?a=1&b=<2>' }]), /<loc>https:\/\/x\.test\/\?a=1&amp;b=&lt;2&gt;<\/loc>/);
  // A quarter with no bills yet is still a valid, empty file.
  assert.equal(urlsetXml([]), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n');
});

console.log(`\nsitemap-ids: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
