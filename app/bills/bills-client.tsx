'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState, useEffect, useRef } from 'react';
import { billsService } from '@/lib/services/bills-service';
import { analytics } from '@/lib/analytics';
import { formatCongressOrdinalSpan, formatCongressYearSpan } from '@/lib/congress';
import type { Bill } from '../../lib/types/bill';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SlidersHorizontal } from 'lucide-react';
import BillCard from '@/components/bills/bill-card';
import { filterSignature } from './filter-signature';

const BillsFilter = dynamic(() => import('@/components/bills/bills-filter'), { ssr: false });
const SyncStatus = dynamic(() => import('@/components/bills/sync-status'), { ssr: false });

const ITEMS_PER_PAGE = 9;

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
  initialTotal: number | null;
  initialPage: number;
  urlFilters: UrlFilters;
  /**
   * Signature of the filter set the server actually applied (URL values over
   * defaults). When the hydrated client state matches it, the initial fetch
   * is skipped — the server-rendered results are already correct.
   */
  serverFilterSignature: string;
  hadUrlParams: boolean;
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
  hadUrlParams,
  congressRange: initialCongressRange,
}: BillsClientProps) {
  const [bills, setBills] = useState<Bill[]>(initialBills ?? []);
  const [hasMore, setHasMore] = useState(initialHasMore);
  // `totalBills` is loaded asynchronously — kept off the critical render path
  // so bills appear fast. `null` means "still loading / unknown".
  const [totalBills, setTotalBills] = useState<number | null>(initialTotal);
  const [currentPage, setCurrentPage] = useState(initialPage);
  // Filter precedence: URL param (server-applied) > localStorage > default.
  // URL values come in as props so server HTML and first client render agree.
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    urlFilters.status ?? (typeof window !== 'undefined' ? localStorage.getItem('billsStatusFilter') || 'all' : 'all')
  );
  const [introducedDateFilter, setIntroducedDateFilter] = useState<string>(() =>
    urlFilters.introducedDate ?? (typeof window !== 'undefined' ? localStorage.getItem('billsIntroducedDateFilter') || 'all' : 'all')
  );
  const [lastActionDateFilter, setLastActionDateFilter] = useState<string>(() =>
    urlFilters.lastActionDate ?? (typeof window !== 'undefined' ? localStorage.getItem('billsLastActionDateFilter') || 'all' : 'all')
  );
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => {
    if (urlFilters.sponsor && urlFilters.sponsor.length > 0) return urlFilters.sponsor;
    if (typeof window === 'undefined') return [];
    const raw = localStorage.getItem('billsSponsorFilter');
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((s): s is string => typeof s === 'string');
    } catch {
      // Legacy single-string value — treat it as one pre-selected sponsor only
      // if it looks like a full name ("First Last"). Otherwise drop it; the old
      // fuzzy filter would have matched anything, and we no longer support that.
      if (/^[\p{L} .'\-]+\s+[\p{L} .'\-]+$/u.test(raw)) return [raw];
    }
    return [];
  });
  const [titleFilter, setTitleFilter] = useState(() =>
    urlFilters.title ?? (typeof window !== 'undefined' ? localStorage.getItem('billsTitleFilter') || '' : '')
  );
  const [stateFilter, setStateFilter] = useState<string>(() =>
    urlFilters.state ?? (typeof window !== 'undefined' ? localStorage.getItem('billsStateFilter') || 'all' : 'all')
  );
  const [policyAreaFilter, setPolicyAreaFilter] = useState<string>(() =>
    urlFilters.policyArea ?? (typeof window !== 'undefined' ? localStorage.getItem('billsPolicyAreaFilter') || 'all' : 'all')
  );
  const [billTypeFilter, setBillTypeFilter] = useState<string>(() =>
    urlFilters.billType ?? (typeof window !== 'undefined' ? localStorage.getItem('billsTypeFilter') || 'all' : 'all')
  );
  const [billNumberFilter, setBillNumberFilter] = useState(() =>
    urlFilters.billNumber ?? (typeof window !== 'undefined' ? localStorage.getItem('billsNumberFilter') || '' : '')
  );
  const [isLoading, setIsLoading] = useState(initialBills === null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [congressRange, setCongressRange] = useState<{ oldest: number; newest: number } | null>(initialCongressRange);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [congressFilter, setCongressFilter] = useState<string>(() =>
    urlFilters.congress ?? (typeof window !== 'undefined' ? localStorage.getItem('billsCongressFilter') || 'all' : 'all')
  );
  const [pendingFilters, setPendingFilters] = useState<{
    status: string;
    introducedDate: string;
    lastActionDate: string;
    state: string;
    policyArea: string;
    billType: string;
    billNumber: string;
    title: string;
    sponsor: string[];
    congress: string;
  }>({
    status: 'all',
    introducedDate: 'all',
    lastActionDate: 'all',
    state: 'all',
    policyArea: 'all',
    billType: 'all',
    billNumber: '',
    title: '',
    sponsor: [],
    congress: 'all',
  });
  const [hasFilterChanges, setHasFilterChanges] = useState(false);
  // The filter state above falls back to localStorage in its initializers, so
  // on the server (no localStorage) it is URL params/defaults, while a returning
  // user's browser restores their saved filters. Any markup that depends on
  // filter state therefore differs between the server HTML and the first client
  // render, which throws React hydration error #418. Gate such markup on
  // `mounted` so it only renders after hydration, when client and server agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  // URL params are one-shot drill-down seeds (homepage → /bills?congress=119…).
  // The server already applied them; strip them so refresh/back doesn't re-pin
  // the filters. Invisible to crawlers (no JS).
  useEffect(() => {
    if (hadUrlParams && typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('billsStatusFilter', statusFilter);
      localStorage.setItem('billsIntroducedDateFilter', introducedDateFilter);
      localStorage.setItem('billsLastActionDateFilter', lastActionDateFilter);
      localStorage.setItem('billsSponsorFilter', JSON.stringify(sponsorFilter));
      localStorage.setItem('billsTitleFilter', titleFilter);
      localStorage.setItem('billsStateFilter', stateFilter);
      localStorage.setItem('billsPolicyAreaFilter', policyAreaFilter);
      localStorage.setItem('billsTypeFilter', billTypeFilter);
      localStorage.setItem('billsNumberFilter', billNumberFilter);
      localStorage.setItem('billsCongressFilter', congressFilter);
    }
  }, [
    statusFilter, introducedDateFilter, lastActionDateFilter, sponsorFilter,
    titleFilter, stateFilter, policyAreaFilter, billTypeFilter,
    billNumberFilter, congressFilter,
  ]);

  useEffect(() => {
    setPendingFilters({
      status: statusFilter,
      introducedDate: introducedDateFilter,
      lastActionDate: lastActionDateFilter,
      state: stateFilter,
      policyArea: policyAreaFilter,
      billType: billTypeFilter,
      billNumber: billNumberFilter,
      title: titleFilter,
      sponsor: sponsorFilter,
      congress: congressFilter,
    });
  }, [
    statusFilter, introducedDateFilter, lastActionDateFilter, stateFilter,
    policyAreaFilter, billTypeFilter, billNumberFilter, titleFilter,
    sponsorFilter, congressFilter,
  ]);

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
    setPendingFilters((p) => ({ ...p, billNumber: '' }));
    setHasFilterChanges(false);

    if (typeof window !== 'undefined') {
      [
        'billsStatusFilter','billsIntroducedDateFilter','billsLastActionDateFilter',
        'billsSponsorFilter','billsTitleFilter','billsStateFilter',
        'billsPolicyAreaFilter','billsTypeFilter','billsNumberFilter','billsCongressFilter',
      ].forEach((k) => localStorage.removeItem(k));
    }
  };

  // Count of filters that differ from their defaults (for analytics properties).
  const countActiveFilters = () => {
    let n = 0;
    if (statusFilter !== 'all') n++;
    if (introducedDateFilter !== 'all') n++;
    if (lastActionDateFilter !== 'all') n++;
    if (sponsorFilter.length > 0) n++;
    if (titleFilter !== '') n++;
    if (stateFilter !== 'all') n++;
    if (policyAreaFilter !== 'all') n++;
    if (billTypeFilter !== 'all') n++;
    if (billNumberFilter !== '') n++;
    if (congressFilter !== 'all') n++;
    return n;
  };

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

  // Skip the initial fetch when the server already rendered these exact
  // results (no localStorage divergence). When a returning user's saved
  // filters differ from what the server applied, fall through and refetch —
  // same UX as before SSR.
  const isFirstFetchRun = useRef(true);

  useEffect(() => {
    if (isFirstFetchRun.current) {
      isFirstFetchRun.current = false;
      const currentSignature = filterSignature({
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
      });
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
        if (response.data.length === 0 && hasFiltersActive(
          statusFilter, introducedDateFilter, lastActionDateFilter,
          sponsorFilter, titleFilter, stateFilter, policyAreaFilter,
          billTypeFilter, billNumberFilter, congressFilter,
        )) {
          analytics.billsNoResults(countActiveFilters(), titleFilter);
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
        setTotalBills(result.exact ? result.count : null);
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

  const handleApplyFilters = () => {
    const f = pendingFilters;
    analytics.billsFiltersApplied({
      status: f.status,
      bill_type: f.billType,
      congress: f.congress,
      state: f.state,
      policy_area: f.policyArea,
      introduced_date: f.introducedDate,
      last_action_date: f.lastActionDate,
      title_query: f.title,
      bill_number: f.billNumber,
      sponsor_count: f.sponsor.length,
      active_filter_count: [
        f.status !== 'all', f.introducedDate !== 'all', f.lastActionDate !== 'all',
        f.sponsor.length > 0, f.title !== '', f.state !== 'all', f.policyArea !== 'all',
        f.billType !== 'all', f.billNumber !== '', f.congress !== 'all',
      ].filter(Boolean).length,
    });
    setCurrentPage(1);
    setStatusFilter(pendingFilters.status);
    setIntroducedDateFilter(pendingFilters.introducedDate);
    setLastActionDateFilter(pendingFilters.lastActionDate);
    setStateFilter(pendingFilters.state);
    setPolicyAreaFilter(pendingFilters.policyArea);
    setBillTypeFilter(pendingFilters.billType);
    setBillNumberFilter(pendingFilters.billNumber);
    setTitleFilter(pendingFilters.title);
    setSponsorFilter(pendingFilters.sponsor);
    setCongressFilter(pendingFilters.congress);
    setIsFilterSheetOpen(false);
    setHasFilterChanges(false);
  };

  const handlePendingFilterChange = (filterType: string, value: string | string[]) => {
    setPendingFilters((prev) => ({ ...prev, [filterType]: value }));
    setHasFilterChanges(true);
  };

  const filtersActive = hasFiltersActive(
    statusFilter, introducedDateFilter, lastActionDateFilter,
    sponsorFilter, titleFilter, stateFilter, policyAreaFilter,
    billTypeFilter, billNumberFilter, congressFilter,
  );

  // Signature of the active filter set. Re-keying the results grid on this
  // makes the new cards cross-fade/stagger in when filters change, while a
  // "load more" (same signature) leaves the existing cards untouched.
  const resultsKey = [
    statusFilter, introducedDateFilter, lastActionDateFilter,
    sponsorFilter.join(','), titleFilter, stateFilter, policyAreaFilter,
    billTypeFilter, billNumberFilter, congressFilter,
  ].join('|');

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
        {/* Mobile filter trigger */}
        <div className="lg:hidden mb-5">
          <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full">
                <SlidersHorizontal className="h-4 w-4" />
                Filters
                {mounted && filtersActive && (
                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85vh] border-t border-border bg-background p-0">
              <div className="flex h-full flex-col">
                <div className="border-b border-border px-5 py-4">
                  <p className="font-serif text-lg font-semibold tracking-tight">Filter bills</p>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-5">
                  <BillsFilter
                    statusFilter={pendingFilters.status}
                    introducedDateFilter={pendingFilters.introducedDate}
                    lastActionDateFilter={pendingFilters.lastActionDate}
                    sponsorFilter={pendingFilters.sponsor}
                    titleFilter={pendingFilters.title}
                    stateFilter={pendingFilters.state}
                    policyAreaFilter={pendingFilters.policyArea}
                    billTypeFilter={pendingFilters.billType}
                    billNumberFilter={pendingFilters.billNumber}
                    congressFilter={pendingFilters.congress}
                    onStatusChange={(v) => handlePendingFilterChange('status', v)}
                    onIntroducedDateChange={(v) => handlePendingFilterChange('introducedDate', v)}
                    onLastActionDateChange={(v) => handlePendingFilterChange('lastActionDate', v)}
                    onSponsorChange={(v) => handlePendingFilterChange('sponsor', v)}
                    onTitleChange={(v) => handlePendingFilterChange('title', v)}
                    onStateChange={(v) => handlePendingFilterChange('state', v)}
                    onPolicyAreaChange={(v) => handlePendingFilterChange('policyArea', v)}
                    onBillTypeChange={(v) => handlePendingFilterChange('billType', v)}
                    onBillNumberChange={(v) => handlePendingFilterChange('billNumber', v)}
                    onCongressChange={(v) => handlePendingFilterChange('congress', v)}
                    onClearAllFilters={handleClearAllFilters}
                    isMobile={true}
                  />
                </div>
                <div className="border-t border-border px-5 py-4">
                  <Button className="w-full" onClick={handleApplyFilters} disabled={!hasFilterChanges}>
                    Apply filters
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        <div className="flex flex-col lg:flex-row gap-10 lg:gap-12">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block lg:w-[260px] shrink-0">
            <div className="sticky top-24 space-y-6">
              <BillsFilter
                statusFilter={pendingFilters.status}
                introducedDateFilter={pendingFilters.introducedDate}
                lastActionDateFilter={pendingFilters.lastActionDate}
                sponsorFilter={pendingFilters.sponsor}
                titleFilter={pendingFilters.title}
                stateFilter={pendingFilters.state}
                policyAreaFilter={pendingFilters.policyArea}
                billTypeFilter={pendingFilters.billType}
                billNumberFilter={pendingFilters.billNumber}
                congressFilter={pendingFilters.congress}
                onStatusChange={(v) => handlePendingFilterChange('status', v)}
                onIntroducedDateChange={(v) => handlePendingFilterChange('introducedDate', v)}
                onLastActionDateChange={(v) => handlePendingFilterChange('lastActionDate', v)}
                onSponsorChange={(v) => handlePendingFilterChange('sponsor', v)}
                onTitleChange={(v) => handlePendingFilterChange('title', v)}
                onStateChange={(v) => handlePendingFilterChange('state', v)}
                onPolicyAreaChange={(v) => handlePendingFilterChange('policyArea', v)}
                onBillTypeChange={(v) => handlePendingFilterChange('billType', v)}
                onBillNumberChange={(v) => handlePendingFilterChange('billNumber', v)}
                onCongressChange={(v) => handlePendingFilterChange('congress', v)}
                onClearAllFilters={handleClearAllFilters}
                isMobile={false}
              />
              <Button className="w-full" onClick={handleApplyFilters} disabled={!hasFilterChanges}>
                Apply filters
              </Button>
            </div>
          </aside>

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
                    {totalBills !== null && (
                      <>
                        {' '}of{' '}
                        <span className="font-mono font-medium text-foreground tabular">
                          {totalBills.toLocaleString()}
                        </span>
                      </>
                    )}
                    {' '}bills
                    {mounted && filtersActive && <span className="ml-1">· filtered</span>}
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
              className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
            >
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-64 border border-border bg-card rounded-sm animate-pulse" />
                ))
              ) : bills.length > 0 ? (
                bills.map((bill, i) => (
                  <div
                    key={bill.id}
                    className="animate-rise-in"
                    style={{ animationDelay: `${(i % ITEMS_PER_PAGE) * 35}ms` }}
                  >
                    <Suspense fallback={<div className="h-64 border border-border rounded-sm bg-card" />}>
                      <BillCard bill={bill} />
                    </Suspense>
                  </div>
                ))
              ) : (
                <div className="col-span-full border border-dashed border-border rounded-sm p-12 text-center">
                  <p className="font-serif text-xl tracking-tight mb-2">No bills found</p>
                  <p className="text-sm text-muted-foreground">
                    Try removing some filters to broaden the search.
                  </p>
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

function hasFiltersActive(
  statusFilter: string,
  introducedDateFilter: string,
  lastActionDateFilter: string,
  sponsorFilter: string[],
  titleFilter: string,
  stateFilter: string,
  policyAreaFilter: string,
  billTypeFilter: string,
  billNumberFilter: string,
  congressFilter: string,
) {
  return (
    statusFilter !== 'all' ||
    introducedDateFilter !== 'all' ||
    lastActionDateFilter !== 'all' ||
    sponsorFilter.length > 0 ||
    titleFilter !== '' ||
    stateFilter !== 'all' ||
    policyAreaFilter !== 'all' ||
    billTypeFilter !== 'all' ||
    billNumberFilter !== '' ||
    congressFilter !== 'all'
  );
}
