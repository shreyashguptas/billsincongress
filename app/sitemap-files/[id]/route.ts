import { api } from '@/convex/_generated/api';
import { ALL_HUBS } from '@/lib/hubs';
import { SITE_URL } from '@/lib/seo';
import { getConvexHttpClient } from '@/lib/convex-client';
import {
  billLastModified,
  plausibleSitemapChunk,
  servedSitemapChunk,
  sitemapIds,
  urlsetXml,
  type SitemapUrl,
} from '@/lib/sitemap-ids';

// One sitemap file: id 0 = static pages; ids 1191…1198 = the 119th Congress's
// eight quarters, and so on (lib/sitemap-ids.ts says why quarters). Crawlers
// fetch it at /sitemap-<id>.xml (sitemapFileUrl), which next.config.mjs
// rewrites here; /sitemap_index.xml lists them.
//
// A route handler, not Next's sitemap.ts + generateSitemaps, because those
// build only the ids known at deploy time and answer 404 for any other. The
// 120th Congress starts in January 2027 and a new one every two years after:
// its files would be listed in the index from its first day but missing until
// someone deployed. Here every known file is still prerendered at build
// (generateStaticParams), and a new valid one is built the first time a
// crawler asks for it, then kept like the rest. Regenerated at most daily via
// ISR (OpenNext KV incremental cache).
export const revalidate = 86400;
export const dynamicParams = true;

const SITEMAP_PAGE_SIZE = 2500;

// Throws rather than falling back to [{ id: '0' }]. This runs at build time,
// and a fallback would ship a deploy with no bill sitemaps prerendered. Failing
// the build keeps the previous deploy, and its sitemaps, live.
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  const client = getConvexHttpClient();
  // No deployment URL at all is a build without secrets (a fork's pull request,
  // a fresh clone), not an outage: both workflows that can deploy set it. That
  // build has no bills to list, so it keeps the static file only. A lookup that
  // fails, or returns nothing, is the outage case, and throws.
  if (!client) {
    console.warn('sitemap-files: NEXT_PUBLIC_CONVEX_URL is not set; static sitemap only');
    return [{ id: '0' }];
  }
  const congresses = await client.query(api.bills.getCongressNumbers, {});
  return sitemapIds(congresses).map((id) => ({ id: String(id) }));
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const raw = (await params).id;
  // No changefreq or priority anywhere: Google and Bing both ignore them
  // (Google, "Build and submit a sitemap"; Bing Webmaster blog, July 2025), and
  // they were ~40% of each file's bytes. The static pages carry no <lastmod>
  // either: we hold no date they changed, and a made-up one teaches a crawler
  // to distrust the real ones in the bill files.
  if (raw === '0') return xml(urlsetXml(staticPages()));

  // An id that cannot name a quarter of a Congress that has begun is refused
  // here, before any database call. The ids that pass are a small, fixed set,
  // so the 404s cached for them are bounded too.
  const plausible = plausibleSitemapChunk(raw, new Date().toISOString().slice(0, 10));
  if (!plausible) return new Response('Not found', { status: 404 });

  // Every failure below throws. An empty list would be served as a valid,
  // successful sitemap with no bills in it; a throw is a 5xx, which Google
  // retries, and the incremental cache keeps the last good copy meanwhile.
  const client = getConvexHttpClient();
  if (!client) throw new Error(`sitemap ${raw}: NEXT_PUBLIC_CONVEX_URL is not set`);

  // Only a quarter of a Congress we hold is a file. A Congress that has begun
  // but has no bills here yet is a 404, not an empty sitemap.
  const chunk = servedSitemapChunk(plausible, await client.query(api.bills.getCongressNumbers, {}));
  if (!chunk) return new Response('Not found', { status: 404 });

  const entries: SitemapUrl[] = [];
  let cursor: string | null = null;
  // At most ~4,300 bills a quarter at 2,500 per query: one or two Convex calls.
  for (;;) {
    const result: {
      page: Array<{ billId: string; latestActionDate: string | null; introducedDate: string }>;
      isDone: boolean;
      continueCursor: string;
    } = await client.query(api.bills.listForSitemap, {
      congress: chunk.congress,
      introducedFrom: chunk.introducedFrom,
      introducedBefore: chunk.introducedBefore,
      paginationOpts: { cursor, numItems: SITEMAP_PAGE_SIZE },
    });
    for (const bill of result.page) {
      entries.push({ loc: `${SITE_URL}/bills/${bill.billId}`, lastmod: billLastModified(bill) });
    }
    if (result.isDone) break;
    cursor = result.continueCursor;
  }
  // A quarter with no bills yet is a true answer, not a failed one: the index
  // lists a quarter only once it has begun, and a failed read throws above.
  return xml(urlsetXml(entries));
}

function xml(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=0, s-maxage=86400',
    },
  });
}

function staticPages(): SitemapUrl[] {
  return [
    { loc: `${SITE_URL}/` },
    { loc: `${SITE_URL}/bills` },
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
    ...ALL_HUBS.map((hub) => ({ loc: `${SITE_URL}${hub.path}` })),
    { loc: `${SITE_URL}/learn` },
    { loc: `${SITE_URL}/about` },
    { loc: `${SITE_URL}/pro` },
    { loc: `${SITE_URL}/privacy` },
    { loc: `${SITE_URL}/terms` },
  ];
}
