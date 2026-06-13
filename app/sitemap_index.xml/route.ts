import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

const SITE_URL = 'https://billsincongress.com';

// Next's generateSitemaps emits /sitemap/<id>.xml chunks but no index file,
// so this route hand-rolls the <sitemapindex> that robots.txt and Search
// Console point at. Chunk ids must mirror app/sitemap.ts: 0 = static pages,
// then one per congress.
export const revalidate = 86400;

export async function GET(): Promise<Response> {
  let congresses: number[] = [];
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl) {
    try {
      const client = new ConvexHttpClient(convexUrl);
      congresses = await client.query(api.bills.getCongressNumbers, {});
    } catch (error) {
      console.error('sitemap_index: failed to list congresses:', error);
    }
  }

  const ids = [0, ...congresses];
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
