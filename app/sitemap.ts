import type { MetadataRoute } from 'next';
import { api } from '@/convex/_generated/api';
import { ALL_HUBS } from '@/lib/hubs';
import { SITE_URL } from '@/lib/seo';
import { getConvexHttpClient } from '@/lib/convex-client';

// Sitemap id 0 = static pages; ids 117/118/119/… = one sitemap per congress
// (each well under the 50k-URL spec limit). Served at /sitemap/<id>.xml and
// listed by the /sitemap_index.xml route handler. Regenerated at most daily
// via ISR (OpenNext KV incremental cache) — only crawlers fetch these.
export const revalidate = 86400;

const SITEMAP_PAGE_SIZE = 2500;

export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const client = getConvexHttpClient();
  if (!client) return [{ id: 0 }];
  try {
    const congresses = await client.query(api.bills.getCongressNumbers, {});
    return [{ id: 0 }, ...congresses.map((congress) => ({ id: congress }))];
  } catch (error) {
    console.error('generateSitemaps: failed to list congresses:', error);
    return [{ id: 0 }];
  }
}

export default async function sitemap(props: {
  // Next 16 passes the chunk id as a Promise<string> — must be awaited.
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  if (id === 0) {
    return [
      { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
      { url: `${SITE_URL}/bills`, changeFrequency: 'daily', priority: 0.9 },
      // Hub pages sit above individual bills in the hierarchy, so they rank
      // between /bills and a bill page. They are linked from the footer and the
      // /bills directory too — a sitemap entry declares them, links make them
      // discoverable, and the indexing problem needs both.
      ...ALL_HUBS.map((hub) => ({
        url: `${SITE_URL}${hub.path}`,
        changeFrequency: 'daily' as const,
        priority: 0.8,
      })),
      { url: `${SITE_URL}/learn`, changeFrequency: 'monthly', priority: 0.6 },
      { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
    ];
  }

  const client = getConvexHttpClient();
  if (!client) return [];

  const entries: MetadataRoute.Sitemap = [];
  let cursor: string | null = null;
  // ~17-20k bills per congress at 2,500 per query ≈ 7-8 Convex calls.
  for (;;) {
    const result: {
      page: Array<{ billId: string; updatedAt: string }>;
      isDone: boolean;
      continueCursor: string;
    } = await client.query(api.bills.listForSitemap, {
      congress: id,
      paginationOpts: { cursor, numItems: SITEMAP_PAGE_SIZE },
    });
    for (const bill of result.page) {
      const lastModified = new Date(bill.updatedAt);
      entries.push({
        url: `${SITE_URL}/bills/${bill.billId}`,
        lastModified: Number.isNaN(lastModified.getTime())
          ? undefined
          : lastModified,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  return entries;
}
