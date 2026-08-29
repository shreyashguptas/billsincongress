'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState, useEffect, useRef, type ReactNode } from 'react';
import { billsService, type BillsCountResult } from '@/lib/services/bills-service';
import { analytics, type FilterSurface } from '@/lib/analytics';
import { formatCount } from '@/lib/utils';
import {
  formatCongressOrdinalSpan,
  formatCongressYearSpan,
} from '@/lib/congress';
import type { Bill } from '../../lib/types/bill';
import { Button } from '@/components/ui/button';
import BillCard from '@/components/bills/bill-card';
import { ScopeAskBar } from '@/components/answers/scope-ask-bar';
import { scopeFromFilters } from '@/lib/answer-scope';
import { FilterBar } from '@/components/bills/filters/filter-bar';
import {
  DEFAULT_FILTER_VALUES,
  filterSignature,
  type BillsFilterValues,
} from './filter-signature';
import {
  FILTER_BY_FIELD,
  activeFilterCount,
  activeFilters,
  isSet,
  scanLimitedActive,
} from '@/lib/bills/filter-registry';
import { buildFilterQuery, filtersFromQuery } from '@/lib/bills/filter-url';

const SyncStatus = dynamic(() => import('@/components/bills/sync-status'), { ssr: false });

const ITEMS_PER_PAGE = 10;

/**
 * Convex scans at most this many bills when no index covers the filter set.
 * Used only to decide whether to warn that a list may be missing older matches.
 * Mirrors MAX_LIST_SCAN in convex/bills.ts.
 */
const MAX_LIST_SCAN = 1200;

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
  chamber?: string;
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
  /** Every Congress with data. Fetched on the server; the client never asks. */
  congressNumbers: number[];
  /**
   * The browse-by-category disclosure, rendered by a server component and
   * passed down as JSX. It must NOT be imported here: importing it would make
   * it a client module and its forty hub anchors would leave the
   * server-rendered HTML, which is the only reason they exist.
   */
  browseDirectory?: ReactNode;
}

export default function BillsClient({
  initialBills,
  initialHasMore,
  initialTotal,
  initialPage,
  urlFilters,
  serverFilterSignature,
  congressNumbers,
  browseDirectory,
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
  //
  // One object rather than eleven hooks, so every change goes through a single
  // chokepoint. That is what makes one analytics call site, one chip
  // implementation and one URL writer possible — the three things that had
  // drifted apart when each filter carried its own state.
  const [filters, setFilters] = useState<BillsFilterValues>(() => ({
    ...DEFAULT_FILTER_VALUES,
    ...Object.fromEntries(
      Object.entries(urlFilters).filter(([, v]) => v !== undefined),
    ),
  }));

  const [isLoading, setIsLoading] = useState(initialBills === null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentSignature = filterSignature(filters);
  const chips = activeFilters(filters);
  const filtersActive = chips.length > 0;

  const congressRange =
    congressNumbers.length > 0
      ? { oldest: Math.min(...congressNumbers), newest: Math.max(...congressNumbers) }
      : null;

  /**
   * The one place a filter changes. Fires the analytics that
   * Documentation/ANALYTICS.md has recorded as missing since the Apply button
   * was removed, and resets pagination so page 4 of one filter set never
   * becomes page 4 of another.
   */
  const setFilter = (patch: Partial<BillsFilterValues>, surface: FilterSurface) => {
    setCurrentPage(1);
    setFilters((previous) => {
      const next = { ...previous, ...patch };
      for (const [field, value] of Object.entries(patch)) {
        const definition = FILTER_BY_FIELD[field];
        if (!definition) continue;
        const count = activeFilterCount(next);
        if (isSet(value as string | string[])) {
          analytics.billsFilterApplied({
            filter_kind: definition.kind,
            // Free text and sponsor names are the reader's business; a length
            // and a count tell us what we need without keeping either.
            ...(definition.field === 'title'
              ? { query_length: String(value).length }
              : definition.field === 'sponsor'
                ? { sponsor_count: (value as string[]).length }
                : { filter_value: String(value) }),
            surface,
            active_filter_count: count,
          });
        } else if (isSet(previous[definition.field])) {
          analytics.billsFilterRemoved({
            filter_kind: definition.kind,
            surface,
            active_filter_count: count,
          });
        }
      }
      return next;
    });
  };

  const handleClearAllFilters = () => {
    setCurrentPage(1);
    setFilters(DEFAULT_FILTER_VALUES);
  };

  // Mirror filter state into the address bar. Uses the History API directly
  // rather than the Next router: the results are already fetched client-side, so
  // a router navigation would re-render the server component and fetch the same
  // page twice.
  const syncedSignature = useRef(serverFilterSignature);
  // NUL-joined so the pair round-trips unambiguously: a title may contain
  // spaces or any printable separator, but never a NUL.
  const syncedText = useRef(`${filters.title}\u0000${filters.billNumber}`);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentSignature === syncedSignature.current) return;

    const text = `${filters.title}\u0000${filters.billNumber}`;
    const textChanged = text !== syncedText.current;
    syncedSignature.current = currentSignature;
    syncedText.current = text;

    const url = `${window.location.pathname}${buildFilterQuery(filters)}`;
    // A search commit replaces the current entry, so Back doesn't have to walk
    // through every settled query. Choosing a value pushes a real entry, so
    // Back returns to the previous filter set.
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
      syncedText.current = `${f.title}\u0000${f.billNumber}`;
      setCurrentPage(1);
      setFilters(f);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const serviceArgs = (f: BillsFilterValues) => ({
    status: f.status,
    introducedDateFilter: f.introducedDate,
    lastActionDateFilter: f.lastActionDate,
    sponsorFilter: f.sponsor,
    titleFilter: f.title,
    stateFilter: f.state,
    policyArea: f.policyArea,
    billType: f.billType,
    billNumber: f.billNumber,
    congress: f.congress,
    chamber: f.chamber === 'all' ? null : (f.chamber as 'house' | 'senate'),
  });

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    setError(null);
    analytics.billsLoadMoreClicked(currentPage + 1, bills.length);
    try {
      const nextPage = currentPage + 1;
      const response = await billsService.fetchBills({
        page: nextPage,
        itemsPerPage: ITEMS_PER_PAGE,
        ...serviceArgs(filters),
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

    const filterArgs = serviceArgs(filters);

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
        if (response.data.length === 0 && activeFilterCount(filters) > 0) {
          analytics.billsNoResults(activeFilterCount(filters), filters.title.length);
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
    // One dependency, not eleven. `sponsor` is an array, so a new-but-equal
    // identity used to trigger a full refetch on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSignature]);

  /**
   * Whether this result set is capped rather than complete.
   *
   * Convex has indexes for topic, outcome and Congress only; every other filter
   * is applied in memory over a bounded scan of the newest bills. So
   * "Sponsor's state: Wyoming" can honestly count 161 bills and then run out
   * after seven, and saying nothing would read as "that is all there is".
   */
  const limitedKinds = scanLimitedActive(filters);
  const knownTotal = totalBills?.exact ? totalBills.count : null;
  const truncation: 'dead_end' | 'advisory' | null =
    !isLoading && limitedKinds.length > 0 && knownTotal !== null
      ? !hasMore && knownTotal > bills.length
        ? 'dead_end'
        : knownTotal > MAX_LIST_SCAN
          ? 'advisory'
          : null
      : null;

  const reportedTruncation = useRef<string>('');
  useEffect(() => {
    if (!truncation) return;
    const key = `${currentSignature}|${truncation}`;
    if (reportedTruncation.current === key) return;
    reportedTruncation.current = key;
    analytics.billsResultsTruncated({
      filter_kinds: limitedKinds,
      shown: bills.length,
      known_total: knownTotal,
      variant: truncation,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truncation, currentSignature]);

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

      <FilterBar
        values={filters}
        onChange={setFilter}
        onClearAll={handleClearAllFilters}
        congressNumbers={congressNumbers}
        browseDirectory={browseDirectory}
      />

      <div className="container-editorial py-8 lg:py-10">
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
                    {' '}of{' '}
                    <span className="font-mono font-medium text-foreground tabular">
                      {/* A capped search knows only a floor, so show "1,024+"
                          rather than presenting it as the full total. The
                          placeholder holds the slot so the line doesn't reflow
                          every time a count is refetched. */}
                      {totalBills?.count != null
                        ? `${formatCount(totalBills.count)}${totalBills.exact ? '' : '+'}`
                        : '…'}
                    </span>
                    {' '}bills
                    {filtersActive && <span className="ml-1">· filtered</span>}
                  </>
                ) : isLoading ? (
                  'Loading…'
                ) : (
                  'No matching bills'
                )}
              </p>
              {/*
                The highest-intent surface on the site (spec §6.3): the reader
                has already said exactly what they care about and is looking at
                more rows than they want to read. Renders nothing on an
                unfiltered list — "explain all 19,000 bills" is not a question.
              */}
              <ScopeAskBar
                scope={scopeFromFilters(filters)}
                count={totalBills?.count ?? bills.length}
              />
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
                        {chips.length === 1
                          ? 'this filter'
                          : `all ${chips.length} of these filters`}
                        . Remove one to widen the search.
                      </p>
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        {chips.map((chip) => (
                          <button
                            key={chip.definition.field}
                            type="button"
                            onClick={() => {
                              analytics.billsNoResultsFilterRemoved(
                                chip.definition.kind,
                                chips.length,
                              );
                              setFilter(
                                {
                                  [chip.definition.field]: chip.definition.multi
                                    ? []
                                    : chip.definition.field === 'title' ||
                                        chip.definition.field === 'billNumber'
                                      ? ''
                                      : 'all',
                                } as Partial<BillsFilterValues>,
                                'empty_state',
                              );
                            }}
                            className="group inline-flex max-w-full items-center gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <span className="truncate">
                              {chip.definition.label}: {chip.label}
                            </span>
                            <span aria-hidden="true" className="text-muted-foreground group-hover:text-foreground">
                              ×
                            </span>
                            <span className="sr-only">Remove this filter</span>
                          </button>
                        ))}
                      </div>
                      <div className="mt-5">
                        <Button
                          onClick={() => {
                            analytics.billsFiltersCleared({
                              active_filter_count: chips.length,
                              surface: 'empty_state',
                            });
                            handleClearAllFilters();
                          }}
                          variant="outline"
                          size="sm"
                        >
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

            {truncation && (
              <p className="mt-8 border-l-2 border-border pl-3 text-sm text-muted-foreground">
                {truncation === 'dead_end' ? (
                  <>
                    Showing the{' '}
                    <span className="font-mono tabular text-foreground">{bills.length}</span>{' '}
                    most recent of{' '}
                    <span className="font-mono tabular text-foreground">
                      {formatCount(knownTotal ?? 0)}
                    </span>
                    . This combination reads only the newest bills — add a topic or an
                    outcome to reach further back.
                  </>
                ) : (
                  <>
                    This combination reads only the roughly{' '}
                    <span className="font-mono tabular text-foreground">
                      {formatCount(MAX_LIST_SCAN)}
                    </span>{' '}
                    most recent bills in this Congress, so older matches may be missing.
                    Adding a topic or an outcome searches all of them.
                  </>
                )}
              </p>
            )}

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
