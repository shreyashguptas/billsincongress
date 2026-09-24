import { api } from '@/convex/_generated/api';
import { SITE_URL } from '@/lib/seo';
import { getConvexHttpClient } from '@/lib/convex-client';
import { sitemapIds } from '@/lib/sitemap-ids';

// Next's generateSitemaps emits /sitemap/<id>.xml chunks but no index file,
// so this route hand-rolls the <sitemapindex> that robots.txt and Search
// Console point at. Chunk ids come from lib/sitemap-ids.ts, the same list
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
  if (!client) {
    console.warn('sitemap_index: NEXT_PUBLIC_CONVEX_URL is not set; static sitemap only');
    ids = [0];
  } else {
    ids = sitemapIds(await client.query(api.bills.getCongressNumbers, {}));
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ids.map((id) => `  <sitemap><loc>${SITE_URL}/sitemap/${id}.xml</loc></sitemap>`).join('\n')}
</sitemapindex>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
    },
  });
}
