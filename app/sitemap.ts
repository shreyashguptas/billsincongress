import type { MetadataRoute } from 'next';
import { api } from '@/convex/_generated/api';
import { ALL_HUBS } from '@/lib/hubs';
import { SITE_URL } from '@/lib/seo';
import { getConvexHttpClient } from '@/lib/convex-client';
import { billLastModified, sitemapChunk, sitemapIds } from '@/lib/sitemap-ids';

// Sitemap id 0 = static pages; ids 1191…1198 = the 119th Congress's eight
// quarters, and so on (lib/sitemap-ids.ts says why quarters). Built at
// /sitemap/<id>.xml, served to crawlers at /sitemap-<id>.xml (sitemapFileUrl)
// and listed by the /sitemap_index.xml route handler. Regenerated at most daily
// via ISR (OpenNext KV incremental cache) — only crawlers fetch these.
export const revalidate = 86400;

const SITEMAP_PAGE_SIZE = 2500;

// Throws rather than falling back to [{ id: 0 }]. This runs at build time, and
// a fallback would ship a deploy with no bill sitemaps at all — every quarterly
// /sitemap/<id>.xml a 404 until the next deploy. Failing the build keeps
// the previous deploy, and its sitemaps, live. See lib/sitemap-ids.ts.
export async function generateSitemaps(): Promise<Array<{ id: number }>> {
  const client = getConvexHttpClient();
  // No deployment URL at all is a build without secrets (a fork's pull request,
  // a fresh clone), not an outage: both workflows that can deploy set it. That
  // build has no bills to list, so it keeps the static file only. A lookup that
  // fails, or returns nothing, is the outage case, and throws.
  if (!client) {
    console.warn('generateSitemaps: NEXT_PUBLIC_CONVEX_URL is not set; static sitemap only');
    return [{ id: 0 }];
  }
  const congresses = await client.query(api.bills.getCongressNumbers, {});
  return sitemapIds(congresses).map((id) => ({ id }));
}

export default async function sitemap(props: {
  // Next 16 passes the chunk id as a Promise<string> — must be awaited.
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = Number(await props.id);
  // No changefreq or priority anywhere: Google and Bing both ignore them
  // (Google, "Build and submit a sitemap"; Bing Webmaster blog, July 2025), and
  // they were ~40% of each file's bytes. These pages carry no <lastmod> either:
  // we hold no date they changed, and a made-up one teaches a crawler to
  // distrust the real ones in the bill files.
  if (id === 0) {
    return [
      { url: `${SITE_URL}/` },
      { url: `${SITE_URL}/bills` },
      // Hub pages sit above individual bills in the hierarchy, so they rank
      // between /bills and a bill page. A sitemap entry declares them, links
      // make them discoverable, and the indexing problem needs both.
      //
      // Hubs link to their own siblings, so a crawler that reaches one topic
      // reaches all 33 — but it has to reach one first, and only two places
      // hand it that entry point in server-rendered HTML: the browse
      // disclosure in the /bills filter band (every hub, the only complete
      // index) and the homepage policy-area list (the top 8 topics, and the
      // only hub links on a page Google already indexes). The sitewide footer
      // links both chambers and /bills/enacted, whose sibling row reaches the
      // other stage hubs; it has no topics. A filter picker also links the
      // hub for the value it is set to, but that picker renders nothing until
      // someone opens it, so the anchor is not in the document a crawler gets.
      ...ALL_HUBS.map((hub) => ({ url: `${SITE_URL}${hub.path}` })),
      { url: `${SITE_URL}/learn` },
      { url: `${SITE_URL}/about` },
      { url: `${SITE_URL}/pro` },
      { url: `${SITE_URL}/privacy` },
      { url: `${SITE_URL}/terms` },
    ];
  }

  // Every failure below throws. An empty list would be served as a valid,
  // successful sitemap with no bills in it; a throw is a 5xx, which Google
  // retries, and the incremental cache keeps the last good copy meanwhile.
  const client = getConvexHttpClient();
  if (!client) throw new Error(`sitemap ${id}: NEXT_PUBLIC_CONVEX_URL is not set`);

  // Only the ids generateSitemaps returns are built; any other, including the
  // one-file-per-Congress addresses (/sitemap-119.xml) that Google could not
  // read, answers 404.
  const chunk = sitemapChunk(id);
  const range = {
    congress: chunk.congress,
    introducedFrom: chunk.introducedFrom,
    introducedBefore: chunk.introducedBefore,
  };

  const entries: MetadataRoute.Sitemap = [];
  let cursor: string | null = null;
  // At most ~4,300 bills a quarter at 2,500 per query: one or two Convex calls.
  for (;;) {
    const result: {
      page: Array<{ billId: string; latestActionDate: string | null; introducedDate: string }>;
      isDone: boolean;
      continueCursor: string;
    } = await client.query(api.bills.listForSitemap, {
      ...range,
      paginationOpts: { cursor, numItems: SITEMAP_PAGE_SIZE },
    });
    for (const bill of result.page) {
      entries.push({
        url: `${SITE_URL}/bills/${bill.billId}`,
        lastModified: billLastModified(bill),
      });
    }
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  // A quarter with no bills yet is a true answer, not a failed one: a file is
  // built for every quarter of a Congress before it begins, and the index only
  // lists one once it has. A failed read throws above instead.
  return entries;
}
