import { Suspense, cache, type ReactElement } from 'react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { billsService } from '@/lib/services/bills-service';
import BillCard from '@/components/bills/bill-card';
import SyncStatus from '@/components/bills/sync-status';
import { SourceLine } from '@/components/brand/section';
import { JsonLd } from '@/components/seo/json-ld';
import { formatCongressOrdinal, formatCongressYears } from '@/lib/congress';
import { formatCount } from '@/lib/utils';
import { pagesForCount } from '@/lib/pagination';
import { CrawlablePagination } from '@/components/bills/crawlable-pagination';
import { hubsOfKind, type HubDefinition } from '@/lib/hubs';
import { SHARE_CARD_SIZE, SITE_URL, hubShareImagePath } from '@/lib/seo';
import { HubViewTracker, HubLink } from './hub-view-tracker';
import { AskPageContext } from '@/components/answers/ask-page-context';
import { scopeFromHub } from '@/lib/answer-scope';


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
 * The bill count for a hub — exact, a floor (`exact: false`), or unknown.
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
  const { count, exact } = await hubCount(hub);
  // A hub with no bills is the doorway page this design exists to avoid. It
  // still renders — someone following a link deserves an explanation rather
  // than a 404 — but it must not be offered to search engines as a document.
  // Only a complete count can prove a hub empty.
  const empty = exact && count === 0;
  // The page's own card (app/share-image/[...path]). Named for both Open Graph
  // and X: a page-level openGraph replaces the root one wholesale, which until
  // this card existed left hub links with no picture at all.
  const exactCount = exact ? count : null;
  const shareImage = {
    url: hubShareImagePath(hub.path, exactCount),
    ...SHARE_CARD_SIZE,
    type: 'image/png',
    alt:
      exactCount !== null
        ? `${hub.heading}: ${formatCount(exactCount)} in the current Congress`
        : hub.heading,
  };
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
      images: [shareImage],
    },
    twitter: {
      card: 'summary_large_image',
      title: hub.metaTitle,
      description: hub.metaDescription,
      images: [shareImage],
    },
  };
}

/** `exactCount` is null unless the count was complete — a floor is not a numberOfItems. */
function hubJsonLd(hub: HubDefinition, exactCount: number | null): object {
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
        ...(exactCount !== null ? { numberOfItems: exactCount } : {}),
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
  // A total is stated only when the read was complete (AGENTS.md, "Answer
  // accuracy"). A floor is shown as "N+", and never reaches the JSON-LD, the
  // analytics event or the last page of the pagination bar.
  const total = count.exact ? count.count : null;
  const floor = count.exact ? null : count.count;
  const { lastPage, openEnded } = pagesForCount(count, page, bills.hasMore, PER_PAGE, MAX_PAGE);
  const siblings = hubsOfKind(hub.kind).filter((h) => h.path !== hub.path);

  return (
    <div>
      <JsonLd data={hubJsonLd(hub, total)} />
      <Suspense fallback={null}>
        <HubViewTracker hubKind={hub.kind} hubPath={hub.path} billCount={total} />
      </Suspense>

      {/* Hub pages carry no ask box of their own — the persistent launcher is
          their only one — so this is what makes a question asked from here be
          about THESE bills rather than about the whole Congress. */}
      <AskPageContext
        congress={congress ?? undefined}
        scope={scopeFromHub(hub)}
      />

      {/* Page head — the breadcrumb sits where /bills has its eyebrow. */}
      <header className="container-editorial pb-8 pt-10 sm:pb-10 sm:pt-16">
        <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
          <Link href="/" className="rounded-xs hover:text-ink hover:underline focus-ring">Home</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <Link href="/bills" className="rounded-xs hover:text-ink hover:underline focus-ring">Bills</Link>
          <span className="mx-2" aria-hidden="true">/</span>
          <span className="text-ink-2" aria-current="page">{hub.heading}</span>
        </nav>

        <h1 className="mt-3 text-display-md text-ink sm:text-display-xl">{hub.heading}</h1>

        <p className="mt-4 max-w-measure text-[17px] leading-[1.6] text-ink-2">
          {hub.explainer}
        </p>

        <SourceLine className="mt-4">
          Source: Congress.gov
          <SyncStatus />
        </SourceLine>
      </header>

      <div className="container-editorial pb-16">
        {/* The results bar. The ink rule under it is where the register starts. */}
        <p className="border-b border-ink pb-3 text-sm text-ink-2">
          {total === null && floor === null ? (
            <>Showing bills from the current Congress.</>
          ) : (
            <>
              <span className="font-mono font-medium text-ink tabular">
                {total !== null ? formatCount(total) : `${formatCount(floor ?? 0)}+`}
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
          <p className="border-b border-line py-14 text-center text-[15px] text-ink-2">
            No bills match this in the current Congress.{' '}
            <Link href="/bills" className="link rounded-xs focus-ring">Browse all bills</Link> to look at
            earlier ones.
          </p>
        ) : (
          <div>
            {bills.data.map((bill) => (
              <BillCard key={bill.id} bill={bill} hideTopic={hub.kind === 'topic'} />
            ))}
          </div>
        )}

        <CrawlablePagination
          page={page}
          lastPage={lastPage}
          openEnded={openEnded}
          hrefForPage={(n) => (n === 1 ? hub.path : `${hub.path}?page=${n}`)}
          className="mt-10 justify-center"
        />

        {siblings.length > 0 && (
          <section className="mt-16 border-t border-line pt-8">
            <h2 className="label-eyebrow">
              {hub.kind === 'topic'
                ? 'Other policy areas'
                : hub.kind === 'chamber'
                  ? 'The other chamber'
                  : 'Other stages'}
            </h2>
            <ul className="mt-3 grid gap-x-8 sm:grid-cols-2 lg:grid-cols-3">
              {siblings.map((sibling) => (
                <li key={sibling.path} className="border-b border-line">
                  <HubLink
                    href={sibling.path}
                    hubKind={sibling.kind}
                    placement="hub_siblings"
                    className="flex min-h-10 items-center py-2 text-sm text-ink-2 transition-colors hover:text-ink hover:underline hover:decoration-line-strong hover:underline-offset-[3px] focus-ring"
                  >
                    {sibling.heading}
                  </HubLink>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
