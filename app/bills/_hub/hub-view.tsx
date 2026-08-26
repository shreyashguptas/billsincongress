import { Suspense, cache, type ReactElement } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { billsService } from '@/lib/services/bills-service';
import BillCard from '@/components/bills/bill-card';
import { JsonLd } from '@/components/seo/json-ld';
import { formatCongressOrdinal, formatCongressYears } from '@/lib/congress';
import { formatCount } from '@/lib/utils';
import { CrawlablePagination } from '@/components/bills/crawlable-pagination';
import { hubsOfKind, type HubDefinition } from '@/lib/hubs';
import { HubViewTracker, HubLink } from './hub-view-tracker';

const SITE_URL = 'https://billsincongress.com';

/** Bills per hub page. Larger than /bills' ten, because a hub's job is partly
 *  to hand a crawler a lot of real links in one document. */
const PER_PAGE = 50;

/** The Convex list query caps offset at 500, so page 11 would repeat page 10. */
const MAX_PAGE = 10;

/** Service filter args for a hub. */
function filterFor(hub: HubDefinition) {
  return {
    status: hub.filter.progressStage ?? 'all',
    policyArea: hub.filter.policyArea ?? 'all',
    chamber: hub.filter.chamber ?? null,
  };
}

/**
 * Exact bill count for a hub.
 *
 * `cache` dedupes this across `generateMetadata` and the page render, which run
 * in the same request — metadata needs the count to decide whether to noindex,
 * and the body needs it to display, but it should only be fetched once.
 * Hub objects are module-level singletons, so reference-keyed caching holds.
 */
const hubCount = cache(async (hub: HubDefinition) =>
  billsService.fetchBillsCount(filterFor(hub)).catch(() => ({ count: null, exact: false })),
);

export async function hubMetadata(hub: HubDefinition, page: number): Promise<Metadata> {
  const canonical = page > 1 ? `${hub.path}?page=${page}` : hub.path;
  const { count } = await hubCount(hub);
  // A hub with no bills is the doorway page this design exists to avoid. It
  // still renders — someone following a link deserves an explanation rather
  // than a 404 — but it must not be offered to search engines as a document.
  const empty = count === 0;
  return {
    title: hub.metaTitle,
    description: hub.metaDescription,
    alternates: { canonical },
    ...(empty ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: hub.metaTitle,
      description: hub.metaDescription,
      url: `${SITE_URL}${canonical}`,
      type: 'website',
    },
  };
}

function hubJsonLd(hub: HubDefinition, count: number | null): object {
  const segments = hub.path.split('/').filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${SITE_URL}${hub.path}`,
        url: `${SITE_URL}${hub.path}`,
        name: hub.metaTitle,
        description: hub.metaDescription,
        isPartOf: { '@id': `${SITE_URL}/#website` },
        ...(count !== null ? { numberOfItems: count } : {}),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Bills', item: `${SITE_URL}/bills` },
          ...(segments.length > 2
            ? [{ '@type': 'ListItem', position: 3, name: 'Topics', item: `${SITE_URL}/bills` }]
            : []),
          {
            '@type': 'ListItem',
            position: segments.length > 2 ? 4 : 3,
            name: hub.heading,
            item: `${SITE_URL}${hub.path}`,
          },
        ],
      },
    ],
  };
}

/** `?page=N`, clamped to what the backend can actually serve. */
export function parseHubPage(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = Number.parseInt(raw ?? '1', 10);
  if (Number.isNaN(n)) return 1;
  return Math.min(Math.max(n, 1), MAX_PAGE);
}

/**
 * Renders one hub page.
 *
 * Three things here are deliberate rather than incidental:
 *
 *  - The bill list is server-rendered as real anchors, so a crawler without
 *    JavaScript walks it. That is the whole point — 99.98% of bill pages are
 *    currently reachable only by reading the sitemap.
 *  - Pagination is `<a href="?page=N">` alongside nothing else. "Load more" on
 *    /bills is invisible to a crawler and is why depth was unreachable.
 *  - Every hub links to its siblings, which is what turns a set of pages into a
 *    graph rather than 40 separate dead ends.
 */
export async function HubView({
  hub,
  page,
}: {
  hub: HubDefinition;
  page: number;
}): Promise<ReactElement> {
  const filter = filterFor(hub);

  const [bills, count, congressNumbers] = await Promise.all([
    billsService
      .fetchBills({ ...filter, page, itemsPerPage: PER_PAGE })
      .catch(() => ({ data: [], hasMore: false })),
    hubCount(hub),
    billsService.getAvailableCongressNumbers().catch(() => [] as number[]),
  ]);

  const congress = congressNumbers.length > 0 ? Math.max(...congressNumbers) : null;
  const total = count.count;
  const lastPage = total === null ? 1 : Math.min(Math.ceil(total / PER_PAGE), MAX_PAGE);
  const siblings = hubsOfKind(hub.kind).filter((h) => h.path !== hub.path);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <JsonLd data={hubJsonLd(hub, total)} />
      <Suspense fallback={null}>
        <HubViewTracker hubKind={hub.kind} hubPath={hub.path} billCount={total} />
      </Suspense>

      <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground mb-4">
        <Link href="/" className="hover:underline">Home</Link>
        <span className="mx-2">/</span>
        <Link href="/bills" className="hover:underline">Bills</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{hub.heading}</span>
      </nav>

      <h1 className="text-3xl font-semibold tracking-tight mb-3">{hub.heading}</h1>

      <p className="text-base text-muted-foreground leading-relaxed mb-4 max-w-3xl">
        {hub.explainer}
      </p>

      <p className="text-sm text-muted-foreground mb-8">
        {total === null ? (
          <>Showing bills from the current Congress.</>
        ) : (
          <>
            <span className="font-mono font-medium text-foreground tabular-nums">
              {formatCount(total)}
            </span>{' '}
            {total === 1 ? 'bill' : 'bills'}
            {congress !== null && (
              <> in the {formatCongressOrdinal(congress)} Congress ({formatCongressYears(congress)})</>
            )}
            .
          </>
        )}
      </p>

      {bills.data.length === 0 ? (
        <p className="text-muted-foreground mb-10">
          No bills match this in the current Congress.{' '}
          <Link href="/bills" className="underline">Browse all bills</Link> to look at earlier ones.
        </p>
      ) : (
        <div className="grid gap-4 mb-10">
          {bills.data.map((bill) => (
            <BillCard key={bill.id} bill={bill} />
          ))}
        </div>
      )}

      <CrawlablePagination
        page={page}
        lastPage={lastPage}
        hrefForPage={(n) => (n === 1 ? hub.path : `${hub.path}?page=${n}`)}
        className="mb-12"
      />

      {siblings.length > 0 && (
        <section className="border-t pt-6">
          <h2 className="text-sm font-medium mb-3">
            {hub.kind === 'topic'
              ? 'Other policy areas'
              : hub.kind === 'chamber'
                ? 'The other chamber'
                : 'Other stages'}
          </h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {siblings.map((sibling) => (
              <li key={sibling.path}>
                <HubLink
                  href={sibling.path}
                  hubKind={sibling.kind}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  {sibling.heading}
                </HubLink>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
