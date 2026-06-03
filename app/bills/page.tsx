'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState, useEffect } from 'react';
import { billsService } from '@/lib/services/bills-service';
import { analytics } from '@/lib/analytics';
import type { Bill } from '../../lib/types/bill';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SlidersHorizontal } from 'lucide-react';

const BillsFilter = dynamic(() => import('@/components/bills/bills-filter'), { ssr: false });
const BillCard = dynamic(() => import('@/components/bills/bill-card'), { ssr: false });
const SyncStatus = dynamic(() => import('@/components/bills/sync-status'), { ssr: false });

const ITEMS_PER_PAGE = 9;

export default function BillsPage() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [hasMore, setHasMore] = useState(false);
  // `totalBills` is loaded asynchronously — kept off the critical render path
  // so bills appear fast. `null` means "still loading / unknown".
  const [totalBills, setTotalBills] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsStatusFilter') || 'all' : 'all'
  );
  const [introducedDateFilter, setIntroducedDateFilter] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsIntroducedDateFilter') || 'all' : 'all'
  );
  const [lastActionDateFilter, setLastActionDateFilter] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsLastActionDateFilter') || 'all' : 'all'
  );
  const [sponsorFilter, setSponsorFilter] = useState<string[]>(() => {
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
    typeof window !== 'undefined' ? localStorage.getItem('billsTitleFilter') || '' : ''
  );
  const [stateFilter, setStateFilter] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsStateFilter') || 'all' : 'all'
  );
  const [policyAreaFilter, setPolicyAreaFilter] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsPolicyAreaFilter') || 'all' : 'all'
  );
  const [billTypeFilter, setBillTypeFilter] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsTypeFilter') || 'all' : 'all'
  );
  const [billNumberFilter, setBillNumberFilter] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsNumberFilter') || '' : ''
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [congressInfo, setCongressInfo] = useState<{ congress: number; startYear: number; endYear: number } | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [congressFilter, setCongressFilter] = useState<string>(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsCongressFilter') || 'all' : 'all'
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

  useEffect(() => {
    const fetchCongressInfo = async () => {
      try {
        const info = await billsService.getCongressInfo();
        setCongressInfo(info);
      } catch (e) {
        console.error('Error fetching Congress info:', e);
      }
    };
    fetchCongressInfo();
  }, []);

  // Seed filter state from homepage drill-down URL params, then strip them.
  // Must run post-mount (not in useState initializer) because this page is
  // SSR'd — window.location.search isn't available at initializer time and
  // React reuses the SSR value on hydration, so URL params never reach state
  // if read during init.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.size === 0) return;

    const urlToSetter: Array<[string, (v: string) => void]> = [
      ['status', setStatusFilter],
      ['introducedDate', setIntroducedDateFilter],
      ['lastActionDate', setLastActionDateFilter],
      ['title', setTitleFilter],
      ['state', setStateFilter],
      ['policyArea', setPolicyAreaFilter],
      ['billType', setBillTypeFilter],
      ['billNumber', setBillNumberFilter],
      ['congress', setCongressFilter],
    ];
    for (const [key, setter] of urlToSetter) {
      const v = params.get(key);
      if (v !== null && v !== '') setter(v);
    }
    // Sponsor is multi-valued. Accept either repeated `?sponsor=` params or a
    // single value from the homepage drill-down. Dedupe to be safe.
    const sponsorValues = params.getAll('sponsor').filter((v) => v !== '');
    if (sponsorValues.length > 0) {
      setSponsorFilter(Array.from(new Set(sponsorValues)));
    }
    window.history.replaceState({}, '', window.location.pathname);
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

  useEffect(() => {
    // Cancel flag so a slow stale fetch can't overwrite fresh state when
    // filters change rapidly (e.g. URL-param seeding on mount triggers a
    // second fetch while the first is still in flight).
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
              {congressInfo && (
                <>
                  {' '}
                  <span className="font-mono tabular">
                    ({congressInfo.startYear}–{congressInfo.endYear})
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
                {filtersActive && (
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
