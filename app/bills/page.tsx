'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState, useEffect } from 'react';
import { billsService } from '@/lib/services/bills-service';
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
  const [totalBills, setTotalBills] = useState(0);
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
  const [sponsorFilter, setSponsorFilter] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('billsSponsorFilter') || '' : ''
  );
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
  const [pendingFilters, setPendingFilters] = useState({
    status: 'all',
    introducedDate: 'all',
    lastActionDate: 'all',
    state: 'all',
    policyArea: 'all',
    billType: 'all',
    billNumber: '',
    title: '',
    sponsor: '',
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('billsStatusFilter', statusFilter);
      localStorage.setItem('billsIntroducedDateFilter', introducedDateFilter);
      localStorage.setItem('billsLastActionDateFilter', lastActionDateFilter);
      localStorage.setItem('billsSponsorFilter', sponsorFilter);
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
    setCurrentPage(1);
    setStatusFilter('all');
    setIntroducedDateFilter('all');
    setLastActionDateFilter('all');
    setSponsorFilter('');
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

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    setError(null);
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
      setTotalBills(response.count);
      setCurrentPage(nextPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load more bills');
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    const fetchBills = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await billsService.fetchBills({
          page: 1,
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
        setBills(response.data);
        setTotalBills(response.count);
        setCurrentPage(1);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to fetch bills');
      } finally {
        setIsLoading(false);
      }
    };
    fetchBills();
  }, [
    statusFilter, introducedDateFilter, lastActionDateFilter, sponsorFilter,
    titleFilter, stateFilter, policyAreaFilter, billTypeFilter,
    billNumberFilter, congressFilter,
  ]);

  const hasMoreBills = totalBills > bills.length;

  const handleApplyFilters = () => {
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

  const handlePendingFilterChange = (filterType: string, value: string) => {
    setPendingFilters((prev) => ({ ...prev, [filterType]: value }));
    setHasFilterChanges(true);
  };

  const filtersActive = hasFiltersActive(
    statusFilter, introducedDateFilter, lastActionDateFilter,
    sponsorFilter, titleFilter, stateFilter, policyAreaFilter,
    billTypeFilter, billNumberFilter, congressFilter,
  );

  return (
    <div className="animate-fade-in">
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
                    </span>{' '}
                    of{' '}
                    <span className="font-mono font-medium text-foreground tabular">
                      {totalBills.toLocaleString()}
                    </span>{' '}
                    bills
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

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-64 border border-border bg-card rounded-sm animate-pulse" />
                ))
              ) : bills.length > 0 ? (
                bills.map((bill) => (
                  <Suspense key={bill.id} fallback={<div className="h-64 border border-border rounded-sm bg-card" />}>
                    <BillCard bill={bill} />
                  </Suspense>
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

            {hasMoreBills && (
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
  sponsorFilter: string,
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
    sponsorFilter !== '' ||
    titleFilter !== '' ||
    stateFilter !== 'all' ||
    policyAreaFilter !== 'all' ||
    billTypeFilter !== 'all' ||
    billNumberFilter !== '' ||
    congressFilter !== 'all'
  );
}
