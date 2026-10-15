import { api } from '@/convex/_generated/api';
import { SITE_URL } from '@/lib/seo';
import { getConvexHttpClient } from '@/lib/convex-client';
import { billLastModified, sitemapFileUrl, sitemapIds } from '@/lib/sitemap-ids';

// Next's generateSitemaps emits /sitemap/<id>.xml chunks but no index file,
// so this route hand-rolls the <sitemapindex> that robots.txt and Search
// Console point at. It lists each file at its root address, /sitemap-<id>.xml
// (see sitemapFileUrl for why). Chunk ids come from lib/sitemap-ids.ts, the same list
// app/sitemap.ts builds from: 0 = static pages, then one per congress.
export const revalidate = 86400;

// A failed lookup throws. It used to be caught and answered with an index
// listing only the static file — "Success" with no bills in it, cacheable for
// up to 30 days. Google read this index exactly once (23 Jun 2026), found 0
// pages and stopped. A throw is a 5xx that Google retries, and the cache keeps
// the last good index in the meantime.
export async function GET(): Promise<Response> {
  const client = getConvexHttpClient();
  // No deployment URL at all is a build without secrets (a fork's pull request,
  // a fresh clone), not an outage — this route is prerendered at build, so a
  // throw here would fail that build. Mirror generateSitemaps and list the
  // static file only. A lookup that fails or returns nothing still throws.
  let ids: number[];
  let lastModified = new Map<number, string>();
  if (!client) {
    console.warn('sitemap_index: NEXT_PUBLIC_CONVEX_URL is not set; static sitemap only');
    ids = [0];
  } else {
    ids = sitemapIds(await client.query(api.bills.getCongressNumbers, {}));
    lastModified = await congressLastModified(client);
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ids.map((id) => sitemapEntry(id, lastModified.get(id))).join('\n')}
</sitemapindex>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
    },
  });
}

function sitemapEntry(id: number, lastmod: string | undefined): string {
  const loc = `<loc>${sitemapFileUrl(SITE_URL, id)}</loc>`;
  return lastmod
    ? `  <sitemap>${loc}<lastmod>${lastmod}</lastmod></sitemap>`
    : `  <sitemap>${loc}</sitemap>`;
}

/**
 * Each Congress file's `<lastmod>`: the newest action in it, the same dates the
 * file's own entries carry. Google uses an index lastmod to decide which files
 * to re-read. The static file (0) has none, as its pages have none.
 *
 * A failure here leaves the dates out rather than failing the index: lastmod is
 * optional, and an index with every file but no dates is complete. Only a
 * missing file list has to fail (see lib/sitemap-ids.ts).
 */
async function congressLastModified(
  client: NonNullable<ReturnType<typeof getConvexHttpClient>>,
): Promise<Map<number, string>> {
  try {
    const rows = await client.query(api.bills.sitemapLastModified, {});
    const dates = new Map<number, string>();
    for (const { congress, lastModified } of rows) {
      const day = billLastModified({ latestActionDate: lastModified });
      if (day) dates.set(congress, day);
    }
    return dates;
  } catch (error) {
    console.error('sitemap_index: lastmod lookup failed; listing files without dates', error);
    return new Map();
  }
}
