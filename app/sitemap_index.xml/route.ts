import { api } from '@/convex/_generated/api';
import { SITE_URL } from '@/lib/seo';
import { getConvexHttpClient } from '@/lib/convex-client';
import { listedSitemapIds, sitemapFileUrl } from '@/lib/sitemap-ids';

// The <sitemapindex> that robots.txt and Search Console point at. It lists each file at its root address, /sitemap-<id>.xml
// (see sitemapFileUrl for why). Ids come from lib/sitemap-ids.ts, as in
// app/sitemap-files/[id]/route.ts: 0 = static pages, then Congress × 10 + quarter (1191 is the
// 119th's first quarter). This index lists only quarters that have begun.
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
  // throw here would fail that build. Mirror generateStaticParams and list the
  // static file only. A lookup that fails or returns nothing still throws.
  let ids: number[];
  if (!client) {
    console.warn('sitemap_index: NEXT_PUBLIC_CONVEX_URL is not set; static sitemap only');
    ids = [0];
  } else {
    const today = new Date().toISOString().slice(0, 10);
    ids = listedSitemapIds(await client.query(api.bills.getCongressNumbers, {}), today);
  }
  // No <lastmod> on the entries. A file's true date is the newest action among
  // its bills, which would mean reading every bill to build this index; the
  // per-Congress date it carried before was right for one file of eight, not
  // all of them. Each bill inside a file keeps its own real date.
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ids.map((id) => `  <sitemap><loc>${sitemapFileUrl(SITE_URL, id)}</loc></sitemap>`).join('\n')}
</sitemapindex>
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
    },
  });
}

