import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { billsService } from '@/lib/services/bills-service';
import type { Bill } from '@/lib/types/bill';
import BillsClient, { type UrlFilters } from './bills-client';
import {
  DEFAULT_FILTER_VALUES,
  filterSignature,
  type BillsFilterValues,
} from './filter-signature';

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams;
  const { page } = parseRequest(params);
  return {
    title: 'All bills',
    description:
      'Browse every bill introduced in the United States Congress — filter by status, chamber, sponsor, state, policy area, and more.',
    alternates: {
      // Deep pages self-canonicalize; page 1 and every filter permutation
      // consolidate on /bills (filters are one-shot drill-down seeds, not
      // stable documents).
      canonical: page > 1 ? `/bills?page=${page}` : '/bills',
    },
  };
}

const ITEMS_PER_PAGE = 9;
// The Convex list query caps offset at 500, so (page - 1) * 9 must stay ≤ 500.
const MAX_PAGE = 56;

type SearchParams = Record<string, string | string[] | undefined>;

interface PageProps {
  searchParams: Promise<SearchParams>;
}

function firstValue(v: string | string[] | undefined): string | undefined {
  const value = Array.isArray(v) ? v[0] : v;
  return value === '' ? undefined : value;
}

function allValues(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  const values = Array.isArray(v) ? v : [v];
  return Array.from(new Set(values.filter((s) => s !== '')));
}

function parseRequest(params: SearchParams): {
  urlFilters: UrlFilters;
  applied: BillsFilterValues;
  page: number;
  hadUrlParams: boolean;
} {
  const urlFilters: UrlFilters = {
    status: firstValue(params.status),
    introducedDate: firstValue(params.introducedDate),
    lastActionDate: firstValue(params.lastActionDate),
    title: firstValue(params.title),
    state: firstValue(params.state),
    policyArea: firstValue(params.policyArea),
    billType: firstValue(params.billType),
    billNumber: firstValue(params.billNumber),
    congress: firstValue(params.congress),
  };
  const sponsor = allValues(params.sponsor);
  if (sponsor.length > 0) urlFilters.sponsor = sponsor;

  const applied: BillsFilterValues = {
    status: urlFilters.status ?? DEFAULT_FILTER_VALUES.status,
    introducedDate: urlFilters.introducedDate ?? DEFAULT_FILTER_VALUES.introducedDate,
    lastActionDate: urlFilters.lastActionDate ?? DEFAULT_FILTER_VALUES.lastActionDate,
    sponsor: urlFilters.sponsor ?? DEFAULT_FILTER_VALUES.sponsor,
    title: urlFilters.title ?? DEFAULT_FILTER_VALUES.title,
    state: urlFilters.state ?? DEFAULT_FILTER_VALUES.state,
    policyArea: urlFilters.policyArea ?? DEFAULT_FILTER_VALUES.policyArea,
    billType: urlFilters.billType ?? DEFAULT_FILTER_VALUES.billType,
    billNumber: urlFilters.billNumber ?? DEFAULT_FILTER_VALUES.billNumber,
    congress: urlFilters.congress ?? DEFAULT_FILTER_VALUES.congress,
  };

  const rawPage = Number.parseInt(firstValue(params.page) ?? '1', 10);
  const page = Math.min(Math.max(Number.isNaN(rawPage) ? 1 : rawPage, 1), MAX_PAGE);

  const hadUrlParams = Object.keys(params).length > 0;

  return { urlFilters, applied, page, hadUrlParams };
}

export default async function BillsPage({ searchParams }: PageProps): Promise<ReactElement> {
  const params = await searchParams;
  const { urlFilters, applied, page, hadUrlParams } = parseRequest(params);

  const serviceArgs = {
    status: applied.status,
    introducedDateFilter: applied.introducedDate,
    lastActionDateFilter: applied.lastActionDate,
    sponsorFilter: applied.sponsor,
    titleFilter: applied.title,
    stateFilter: applied.state,
    policyArea: applied.policyArea,
    billType: applied.billType,
    billNumber: applied.billNumber,
    congress: applied.congress,
  };

  // Server-render the requested page of results so crawlers (and first paint)
  // get real bill links without JavaScript. On any failure fall back to
  // null — the client component then fetches exactly as it did pre-SSR.
  let initialBills: Bill[] | null = null;
  let initialHasMore = false;
  let initialTotal: number | null = null;
  // Oldest/newest Congress with data — drives the header's "(2021–2026 ·
  // 117th–119th)" span. Null until known (or if nothing is available).
  let congressRange: { oldest: number; newest: number } | null = null;
  try {
    const [billsResponse, countResult, congressNumbers] = await Promise.all([
      billsService.fetchBills({ page, itemsPerPage: ITEMS_PER_PAGE, ...serviceArgs }),
      billsService
        .fetchBillsCount(serviceArgs)
        .catch(() => ({ count: null, exact: false })),
      billsService.getAvailableCongressNumbers(),
    ]);
    initialBills = billsResponse.data;
    initialHasMore = billsResponse.hasMore;
    initialTotal = countResult.exact ? countResult.count : null;
    if (congressNumbers.length > 0) {
      congressRange = {
        oldest: Math.min(...congressNumbers),
        newest: Math.max(...congressNumbers),
      };
    }
  } catch (error) {
    console.error('Server-side bills fetch failed, deferring to client:', error);
  }

  return (
    <BillsClient
      initialBills={initialBills}
      initialHasMore={initialHasMore}
      initialTotal={initialTotal}
      initialPage={page}
      urlFilters={urlFilters}
      serverFilterSignature={filterSignature(applied)}
      hadUrlParams={hadUrlParams}
      congressRange={congressRange}
    />
  );
}
