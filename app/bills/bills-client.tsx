'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState, useEffect, useRef } from 'react';
import { billsService, type BillsCountResult } from '@/lib/services/bills-service';
import { parseBillReference } from '@/lib/bill-query';
import { analytics } from '@/lib/analytics';
import {
  formatCongressOrdinal,
  formatCongressOrdinalSpan,
  formatCongressYearSpan,
} from '@/lib/congress';
import type { Bill } from '../../lib/types/bill';
import { Button } from '@/components/ui/button';
import BillCard from '@/components/bills/bill-card';
import { FilterQuickAccess } from '@/components/bills/mobile-filter-bar';
import {
  DEFAULT_FILTER_VALUES,
  filterSignature,
  type BillsFilterValues,
} from './filter-signature';
import {
  BILL_TYPES,
  DATE_OPTIONS,
  STATE_NAMES,
  STATUS_OPTIONS,
} from '@/lib/constants/filters';

/** Chip labels reuse the filter controls' own wording, so the empty state names
 * a filter the same way the control that set it does. Falls back to the raw
 * value rather than hiding an unrecognised one. */
const labelFor = (
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
) => options.find((o) => o.value === value)?.label ?? value;

const SyncStatus = dynamic(() => import('@/components/bills/sync-status'), { ssr: false });

const ITEMS_PER_PAGE = 10;

/**
 * Serialise a filter set back into a query string, omitting anything still at
 * its default. Param names match what `app/bills/page.tsx` parses, so a URL
 * built here server-renders the same results it shows on the client.
 */
function buildFilterQuery(f: BillsFilterValues): string {
  const p = new URLSearchParams();
  if (f.status !== 'all') p.set('status', f.status);
  if (f.introducedDate !== 'all') p.set('introducedDate', f.introducedDate);
  if (f.lastActionDate !== 'all') p.set('lastActionDate', f.lastActionDate);
  if (f.title !== '') p.set('title', f.title);
  if (f.state !== 'all') p.set('state', f.state);
  if (f.policyArea !== 'all') p.set('policyArea', f.policyArea);
  if (f.billType !== 'all') p.set('billType', f.billType);
  if (f.billNumber !== '') p.set('billNumber', f.billNumber);
  if (f.congress !== 'all') p.set('congress', f.congress);
  for (const s of f.sponsor) p.append('sponsor', s);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

/** Inverse of `buildFilterQuery` — used when the user navigates back/forward. */
function filtersFromQuery(search: string): BillsFilterValues {
  const p = new URLSearchParams(search);
  const one = (key: string, fallback: string) => p.get(key) ?? fallback;
  return {
    status: one('status', DEFAULT_FILTER_VALUES.status),
    introducedDate: one('introducedDate', DEFAULT_FILTER_VALUES.introducedDate),
    lastActionDate: one('lastActionDate', DEFAULT_FILTER_VALUES.lastActionDate),
    sponsor: p.getAll('sponsor').filter((s) => s !== ''),
    title: one('title', DEFAULT_FILTER_VALUES.title),
    state: one('state', DEFAULT_FILTER_VALUES.state),
    policyArea: one('policyArea', DEFAULT_FILTER_VALUES.policyArea),
    billType: one('billType', DEFAULT_FILTER_VALUES.billType),
    billNumber: one('billNumber', DEFAULT_FILTER_VALUES.billNumber),
    congress: one('congress', DEFAULT_FILTER_VALUES.congress),
  };
}

/** Filter values the server derived from URL search params (absent = not in URL). */
export interface UrlFilters {
  status?: string;
  introducedDate?: string;
  lastActionDate?: string;
  title?: string;
  state?: string;
  policyArea?: string;
  billType?: string;
  billNumber?: string;
  congress?: string;
  sponsor?: string[];
}

export interface BillsClientProps {
  /** First page of results fetched on the server; null if the server fetch failed. */
  initialBills: Bill[] | null;
  initialHasMore: boolean;
  /** Null when the server couldn't count; `exact: false` means "at least this many". */
  initialTotal: BillsCountResult | null;
  initialPage: number;
  urlFilters: UrlFilters;
  /**
   * Signature of the filter set the server actually applied (URL values over
   * defaults). When the hydrated client state matches it, the initial fetch
   * is skipped — the server-rendered results are already correct.
   */
  serverFilterSignature: string;
  /** Oldest/newest Congress with data — drives the header's year span. */
  congressRange: { oldest: number; newest: number } | null;
}

export default function BillsClient({
  initialBills,
  initialHasMore,
  initialTotal,
  initialPage,
  urlFilters,
  serverFilterSignature,
  congressRange: initialCongressRange,
}: BillsClientProps) {
  const [bills, setBills] = useState<Bill[]>(initialBills ?? []);
  const [hasMore, setHasMore] = useState(initialHasMore);
  // `totalBills` is loaded asynchronously — kept off the critical render path
  // so bills appear fast. `null` means "still loading / unknown".
  const [totalBills, setTotalBills] = useState<BillsCountResult | null>(initialTotal);
  const [currentPage, setCurrentPage] = useState(initialPage);
  // The URL is the single source of truth for filters. Values arrive as props
  // the server already applied, so server HTML and the first client render
  // always agree — and a filtered view can be shared, bookmarked, and walked
  // back through. Filters are deliberately NOT persisted to browser storage:
  // silently re-applying a previous visit's filters produced an unexplained
  // "No bills found" for 358 people a month.
  const [statusFilter, setStatusFilter] = useState<string>(
    () => urlFilters.status ?? DEFAULT_FILTER_VALUES.status
  );
  const [introducedDateFilter, setIntroducedDateFilter] = useState<string>(
    () => urlFilters.introducedDate ?? DEFAULT_FILTER_VALUES.introducedDate
  );
  const [lastActionDateFilter, setLastActionDateFilter] = useState<string>(
    () => urlFilters.lastActionDate ?? DEFAULT_FILTER_VALUES.lastActionDate
  );
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(
    () => urlFilters.sponsor ?? DEFAULT_FILTER_VALUES.sponsor
  );
  const [titleFilter, setTitleFilter] = useState(
    () => urlFilters.title ?? DEFAULT_FILTER_VALUES.title
  );
  const [stateFilter, setStateFilter] = useState<string>(
    () => urlFilters.state ?? DEFAULT_FILTER_VALUES.state
  );
  const [policyAreaFilter, setPolicyAreaFilter] = useState<string>(
    () => urlFilters.policyArea ?? DEFAULT_FILTER_VALUES.policyArea
  );
  const [billTypeFilter, setBillTypeFilter] = useState<string>(
    () => urlFilters.billType ?? DEFAULT_FILTER_VALUES.billType
  );
  const [billNumberFilter, setBillNumberFilter] = useState(
    () => urlFilters.billNumber ?? DEFAULT_FILTER_VALUES.billNumber
  );
  const [isLoading, setIsLoading] = useState(initialBills === null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [congressRange, setCongressRange] = useState<{ oldest: number; newest: number } | null>(initialCongressRange);
  const [congressFilter, setCongressFilter] = useState<string>(
    () => urlFilters.congress ?? DEFAULT_FILTER_VALUES.congress
  );

  const filterValues: BillsFilterValues = {
    status: statusFilter,
    introducedDate: introducedDateFilter,
    lastActionDate: lastActionDateFilter,
    sponsor: sponsorFilter,
    title: titleFilter,
    state: stateFilter,
    policyArea: policyAreaFilter,
    billType: billTypeFilter,
    billNumber: billNumberFilter,
    congress: congressFilter,
  };
  const currentSignature = filterSignature(filterValues);
  useEffect(() => {
    if (congressRange) return;
    const fetchCongressRange = async () => {
      try {
        const numbers = await billsService.getAvailableCongressNumbers();
        if (numbers.length > 0) {
          setCongressRange({
            oldest: Math.min(...numbers),
            newest: Math.max(...numbers),
          });
        }
      } catch (e) {
        console.error('Error fetching Congress range:', e);
      }
    };
    fetchCongressRange();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirror filter state into the address bar. Uses the History API directly
  // rather than the Next router: the results are already fetched client-side, so
  // a router navigation would re-render the server component and fetch the same
  // page twice.
  const syncedSignature = useRef(serverFilterSignature);
  const syncedText = useRef(`${titleFilter} ${billNumberFilter}`);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentSignature === syncedSignature.current) return;

    const text = `${titleFilter} ${billNumberFilter}`;
    const textChanged = text !== syncedText.current;
    syncedSignature.current = currentSignature;
    syncedText.current = text;

    const url = `${window.location.pathname}${buildFilterQuery(filterValues)}`;
    // Typing replaces the current entry, so Back doesn't have to walk through
    // every keystroke. Choosing a dropdown value pushes a real entry, so Back
    // returns to the previous filter set.
    if (textChanged) window.history.replaceState({}, '', url);
    else window.history.pushState({}, '', url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSignature]);

  // Back/forward: re-read the filters out of the URL we just walked to. The
  // signature refs are updated first so the sync effect above treats this as
  // already-current and doesn't push the entry straight back on.
  useEffect(() => {
    const onPopState = () => {
      const f = filtersFromQuery(window.location.search);
      syncedSignature.current = filterSignature(f);
      syncedText.current = `${f.title} ${f.billNumber}`;
      setCurrentPage(1);
      setStatusFilter(f.status);
      setIntroducedDateFilter(f.introducedDate);
      setLastActionDateFilter(f.lastActionDate);
      setSponsorFilter(f.sponsor);
      setTitleFilter(f.title);
      setStateFilter(f.state);
      setPolicyAreaFilter(f.policyArea);
      setBillTypeFilter(f.billType);
      setBillNumberFilter(f.billNumber);
      setCongressFilter(f.congress);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleClearAllFilters = () => {
    analytics.billsFiltersCleared();
    setCurrentPage(1);
    setStatusFilter('all');
    setIntroducedDateFilter('all');
    setLastActionDateFilter('all');
    setSponsorFilter([]);
    setTitleFilter('');
    setStateFilter('all');
    setPolicyAreaFilter('all');
    setBillTypeFilter('all');
    setBillNumberFilter('');
    setCongressFilter('all');
  };

  /**
   * One chip per active filter, so an empty result can name exactly what is
   * narrowing it and let the reader drop constraints one at a time.
   */
  const activeFilterChips: Array<{ kind: string; label: string; clear: () => void }> = [];
  if (congressFilter !== 'all') {
    activeFilterChips.push({
      kind: 'congress',
      label: `${formatCongressOrdinal(Number(congressFilter))} Congress`,
      clear: () => setCongressFilter('all'),
    });
  }
  if (titleFilter !== '') {
    // A search that is entirely a bill reference is run as a number lookup, not
    // a title search, so the chip has to say so — otherwise an empty result
    // claims we looked somewhere we didn't.
    const reference = billNumberFilter === '' ? parseBillReference(titleFilter) : null;
    activeFilterChips.push({
      kind: reference ? 'bill_reference' : 'title',
      label: reference
        ? `Bill ${reference.billType ? `${BILL_TYPES[reference.billType as keyof typeof BILL_TYPES] ?? reference.billType} ` : 'number '}${reference.billNumber}`
        : `Title contains “${titleFilter}”`,
      clear: () => setTitleFilter(''),
    });
  }
  if (billNumberFilter !== '') {
    activeFilterChips.push({
      kind: 'bill_number',
      label: `Bill number ${billNumberFilter}`,
      clear: () => setBillNumberFilter(''),
    });
  }
  if (statusFilter !== 'all') {
    activeFilterChips.push({
      kind: 'status',
      label: labelFor(STATUS_OPTIONS, statusFilter),
      clear: () => setStatusFilter('all'),
    });
  }
  if (billTypeFilter !== 'all') {
    activeFilterChips.push({
      kind: 'bill_type',
      label: BILL_TYPES[billTypeFilter as keyof typeof BILL_TYPES] ?? billTypeFilter,
      clear: () => setBillTypeFilter('all'),
    });
  }
  if (policyAreaFilter !== 'all') {
    activeFilterChips.push({
      kind: 'policy_area',
      label: `Policy area: ${policyAreaFilter}`,
      clear: () => setPolicyAreaFilter('all'),
    });
  }
  if (stateFilter !== 'all') {
    activeFilterChips.push({
      kind: 'state',
      label: STATE_NAMES[stateFilter] ?? stateFilter,
      clear: () => setStateFilter('all'),
    });
  }
  if (sponsorFilter.length > 0) {
    activeFilterChips.push({
      kind: 'sponsor',
      label:
        sponsorFilter.length === 1
          ? `Sponsor: ${sponsorFilter[0]}`
          : `${sponsorFilter.length} sponsors`,
      clear: () => setSponsorFilter([]),
    });
  }
  if (introducedDateFilter !== 'all') {
    activeFilterChips.push({
      kind: 'introduced_date',
      label: `Introduced: ${labelFor(DATE_OPTIONS, introducedDateFilter).toLowerCase()}`,
      clear: () => setIntroducedDateFilter('all'),
    });
  }
  if (lastActionDateFilter !== 'all') {
    activeFilterChips.push({
      kind: 'last_action_date',
      label: `Acted on: ${labelFor(DATE_OPTIONS, lastActionDateFilter).toLowerCase()}`,
      clear: () => setLastActionDateFilter('all'),
    });
  }

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    setError(null);
    analytics.billsLoadMoreClicked(currentPage + 1, bills.length);
    try {
      const nextPage = currentPage + 1;
      const response = await billsService.fetchBills({
        page: nextPage,
        itemsPerPage: ITEMS_PER_PAGE,
        status: statusFilter,
        introducedDateFilter,
        lastActionDateFilter,
        sponsorFilter,
        titleFilter,
        stateFilter,
        policyArea: policyAreaFilter,
        billType: billTypeFilter,
        billNumber: billNumberFilter,
        congress: congressFilter,
      });
      const existing = new Set(bills.map((b) => b.id));
      const newBills = response.data.filter((b) => !existing.has(b.id));
      setBills((prev) => [...prev, ...newBills]);
      setHasMore(response.hasMore);
      setCurrentPage(nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more bills');
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Skip the initial fetch: filters now come only from the URL, so the
  // server-rendered results always match the first client render. The signature
  // check stays as a cheap guard in case a future prop path diverges.
  const isFirstFetchRun = useRef(true);

  useEffect(() => {
    if (isFirstFetchRun.current) {
      isFirstFetchRun.current = false;
      if (initialBills !== null && currentSignature === serverFilterSignature) {
        return;
      }
    }

    // Cancel flag so a slow stale fetch can't overwrite fresh state when
    // filters change rapidly.
    let cancelled = false;

    setIsLoading(true);
    setError(null);
    // Clear count while the new count query is in flight so the header
    // doesn't briefly show a stale "of X" against fresh bills. Counts now
    // render only when Convex can answer from precomputed data.
    setTotalBills(null);

    const filterArgs = {
      status: statusFilter,
      introducedDateFilter,
      lastActionDateFilter,
      sponsorFilter,
      titleFilter,
      stateFilter,
      policyArea: policyAreaFilter,
      billType: billTypeFilter,
      billNumber: billNumberFilter,
      congress: congressFilter,
    };

    // Fire page + count in parallel. We don't await both together; bills render
    // as soon as the page query resolves, and exact counts fill in when cheap.
    billsService
      .fetchBills({ page: 1, itemsPerPage: ITEMS_PER_PAGE, ...filterArgs })
      .then((response) => {
        if (cancelled) return;
        setBills(response.data);
        setHasMore(response.hasMore);
        setCurrentPage(1);
        // UX friction signal: an active filter combination matched nothing.
        if (response.data.length === 0 && activeFilterChips.length > 0) {
          analytics.billsNoResults(activeFilterChips.length, titleFilter);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to fetch bills');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    billsService
      .fetchBillsCount(filterArgs)
      .then((result) => {
        if (cancelled) return;
        setTotalBills(result);
      })
      .catch((e) => {
        // Count failures are non-fatal — bills still render without a total.
        console.error('Error fetching bills count:', e);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    statusFilter, introducedDateFilter, lastActionDateFilter, sponsorFilter,
    titleFilter, stateFilter, policyAreaFilter, billTypeFilter,
    billNumberFilter, congressFilter,
  ]);

  const filtersActive = activeFilterChips.length > 0;

  // Re-keying the results grid on the filter signature makes new cards
  // cross-fade/stagger in when filters change, while a "load more" (same
  // signature) leaves the existing cards untouched.
  const resultsKey = currentSignature;

  return (
    <div>
      {/* Page header — editorial */}
      <section className="border-b border-border">
        <div className="container-editorial py-10 sm:py-12">
          <p className="label-eyebrow mb-3">The record</p>
          <h1 className="font-serif text-display-md sm:text-display-lg font-semibold leading-[1.05] tracking-tight">
            All bills
          </h1>
          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>
              Browse legislation introduced in Congress
              {congressRange && (
                <>
                  {' '}
                  <span className="font-mono tabular">
                    ({formatCongressYearSpan(congressRange.oldest, congressRange.newest)} ·{' '}
                    {formatCongressOrdinalSpan(congressRange.oldest, congressRange.newest)})
                  </span>
                </>
              )}
              .
            </span>
            <SyncStatus />
          </div>
        </div>
      </section>

      <div className="container-editorial py-8 lg:py-10">
        {/* Quick-access filters — always visible, all screens */}
        <div className="mb-5">
          <FilterQuickAccess
            statusFilter={statusFilter}
            introducedDateFilter={introducedDateFilter}
            lastActionDateFilter={lastActionDateFilter}
            sponsorFilter={sponsorFilter}
            titleFilter={titleFilter}
            stateFilter={stateFilter}
            policyAreaFilter={policyAreaFilter}
            billTypeFilter={billTypeFilter}
            billNumberFilter={billNumberFilter}
            congressFilter={congressFilter}
            onStatusChange={setStatusFilter}
            onIntroducedDateChange={setIntroducedDateFilter}
            onLastActionDateChange={setLastActionDateFilter}
            onSponsorChange={setSponsorFilter}
            onTitleChange={setTitleFilter}
            onStateChange={setStateFilter}
            onPolicyAreaChange={setPolicyAreaFilter}
            onBillTypeChange={setBillTypeFilter}
            onBillNumberChange={setBillNumberFilter}
            onCongressChange={setCongressFilter}
            onClearAllFilters={handleClearAllFilters}
            filtersActive={filtersActive}
          />
        </div>

        <div className="flex flex-col gap-10 lg:gap-12">
          {/* Results column */}
          <div className="flex-1 min-w-0">
            <div className="mb-5 flex items-baseline justify-between gap-3 border-b border-border pb-3">
              <p className="text-sm text-muted-foreground">
                {bills.length > 0 ? (
                  <>
                    Showing{' '}
                    <span className="font-mono font-medium text-foreground tabular">
                      {bills.length}
                    </span>
                    {totalBills?.count != null && (
                      <>
                        {' '}of{' '}
                        <span className="font-mono font-medium text-foreground tabular">
                          {/* A capped search knows only a floor, so show "1,024+"
                              rather than presenting it as the full total. */}
                          {totalBills.count.toLocaleString()}
                          {totalBills.exact ? '' : '+'}
                        </span>
                      </>
                    )}
                    {' '}bills
                    {filtersActive && <span className="ml-1">· filtered</span>}
                  </>
                ) : isLoading ? (
                  'Loading…'
                ) : (
                  'No matching bills'
                )}
              </p>
            </div>

            {error && (
              <div className="mb-6 border border-destructive/30 bg-destructive/5 text-destructive px-4 py-3 text-sm rounded-sm">
                {error}
              </div>
            )}

            <div
              key={resultsKey}
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
            >
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-80 border border-border bg-card rounded-sm animate-pulse" />
                ))
              ) : bills.length > 0 ? (
                bills.map((bill, i) => (
                  <div
                    key={bill.id}
                    className="animate-rise-in"
                    style={{ animationDelay: `${(i % ITEMS_PER_PAGE) * 35}ms` }}
                  >
                    <Suspense fallback={<div className="h-80 border border-border rounded-sm bg-card" />}>
                      <BillCard bill={bill} />
                    </Suspense>
                  </div>
                ))
              ) : (
                <div className="col-span-full border border-dashed border-border rounded-sm p-8 sm:p-12 text-center">
                  <p className="font-serif text-xl tracking-tight mb-2">No bills found</p>
                  {filtersActive ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        No bill matches{' '}
                        {activeFilterChips.length === 1
                          ? 'this filter'
                          : `all ${activeFilterChips.length} of these filters`}
                        . Remove one to widen the search.
                      </p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        {activeFilterChips.map((chip) => (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => {
                              analytics.billsNoResultsFilterRemoved(
                                chip.kind,
                                activeFilterChips.length,
                              );
                              chip.clear();
                            }}
                            className="group inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="truncate">{chip.label}</span>
                            <span aria-hidden="true" className="text-muted-foreground group-hover:text-foreground">
                              ×
                            </span>
                            <span className="sr-only">Remove this filter</span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-5">
                        <Button onClick={handleClearAllFilters} variant="outline" size="sm">
                          Clear all filters
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No bills are available right now. Please try again shortly.
                    </p>
                  )}
                </div>
              )}
            </div>

            {hasMore && (
              <div className="mt-10 text-center">
                <Button onClick={handleLoadMore} disabled={isLoadingMore} variant="outline" size="lg">
                  {isLoadingMore ? 'Loading…' : 'Load more bills'}
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

