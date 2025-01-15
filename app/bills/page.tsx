'use client';

import dynamic from 'next/dynamic';
import { Suspense, useState } from 'react';
import { useEffect } from 'react';
import { billsService } from '@/lib/services/bills-service';
import type { Bill } from '../../lib/types/bill';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Filter } from 'lucide-react';

// Dynamic imports with no SSR
const BillsFilter = dynamic(
  () => import('@/components/bills/bills-filter'),
  { ssr: false }
);

const BillCard = dynamic(
  () => import('@/components/bills/bill-card'),
  { ssr: false }
);

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
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [congressInfo, setCongressInfo] = useState<{ congress: number; startYear: number; endYear: number } | null>(null);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [pendingFilters, setPendingFilters] = useState({
    status: 'all',
    introducedDate: 'all',
    lastActionDate: 'all',
    state: 'all',
    policyArea: 'all',
    billType: 'all'
  });
  const [hasFilterChanges, setHasFilterChanges] = useState(false);

  const debouncedSponsorFilter = useDebounce(sponsorFilter, 2000);
  const debouncedTitleFilter = useDebounce(titleFilter, 2000);

  // Fetch Congress info on mount
  useEffect(() => {
    const fetchCongressInfo = async () => {
      try {
        const info = await billsService.getCongressInfo();
        setCongressInfo(info);
      } catch (error) {
        console.error('Error fetching Congress info:', error);
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
    }
  }, [
    statusFilter,
    introducedDateFilter,
    lastActionDateFilter,
    sponsorFilter,
    titleFilter,
    stateFilter,
    policyAreaFilter,
    billTypeFilter
  ]);

  // Initialize pendingFilters with current filter values
  useEffect(() => {
    setPendingFilters({
      status: statusFilter,
      introducedDate: introducedDateFilter,
      lastActionDate: lastActionDateFilter,
      state: stateFilter,
      policyArea: policyAreaFilter,
      billType: billTypeFilter
    });
  }, [statusFilter, introducedDateFilter, lastActionDateFilter, stateFilter, policyAreaFilter, billTypeFilter]);

  const handleClearAllFilters = () => {
    // Reset both actual and pending filters
    setStatusFilter('all');
    setIntroducedDateFilter('all');
    setLastActionDateFilter('all');
    setSponsorFilter('');
    setTitleFilter('');
    setStateFilter('all');
    setPolicyAreaFilter('all');
    setBillTypeFilter('all');
    setPendingFilters({
      status: 'all',
      introducedDate: 'all',
      lastActionDate: 'all',
      state: 'all',
      policyArea: 'all',
      billType: 'all'
    });
    setHasFilterChanges(false);

    if (typeof window !== 'undefined') {
      localStorage.removeItem('billsStatusFilter');
      localStorage.removeItem('billsIntroducedDateFilter');
      localStorage.removeItem('billsLastActionDateFilter');
      localStorage.removeItem('billsSponsorFilter');
      localStorage.removeItem('billsTitleFilter');
      localStorage.removeItem('billsStateFilter');
      localStorage.removeItem('billsPolicyAreaFilter');
      localStorage.removeItem('billsTypeFilter');
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
        introducedDateFilter: introducedDateFilter,
        lastActionDateFilter: lastActionDateFilter,
        sponsorFilter: debouncedSponsorFilter,
        titleFilter: debouncedTitleFilter,
        stateFilter: stateFilter,
        policyArea: policyAreaFilter,
        billType: billTypeFilter,
      });
      setBills(prevBills => [...prevBills, ...response.data]);
      setTotalBills(response.count);
      setCurrentPage(nextPage);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load more bills';
      console.error('Error loading more bills:', error);
      setError(message);
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
          introducedDateFilter: introducedDateFilter,
          lastActionDateFilter: lastActionDateFilter,
          sponsorFilter: debouncedSponsorFilter,
          titleFilter: debouncedTitleFilter,
          stateFilter: stateFilter,
          policyArea: policyAreaFilter,
          billType: billTypeFilter,
        });
        setBills(response.data);
        setTotalBills(response.count);
        setCurrentPage(1);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to fetch bills';
        console.error('Error fetching bills:', error);
        setError(message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBills();
  }, [statusFilter, introducedDateFilter, lastActionDateFilter, debouncedSponsorFilter, debouncedTitleFilter, stateFilter, policyAreaFilter, billTypeFilter]);

  const hasMoreBills = bills.length < totalBills;

  const handleApplyFilters = () => {
    setStatusFilter(pendingFilters.status);
    setIntroducedDateFilter(pendingFilters.introducedDate);
    setLastActionDateFilter(pendingFilters.lastActionDate);
    setStateFilter(pendingFilters.state);
    setPolicyAreaFilter(pendingFilters.policyArea);
    setBillTypeFilter(pendingFilters.billType);
    setIsFilterSheetOpen(false);
    setHasFilterChanges(false);
  };

  const handlePendingFilterChange = (filterType: string, value: string) => {
    setPendingFilters(prev => ({ ...prev, [filterType]: value }));
    setHasFilterChanges(true);
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <div className="flex items-baseline justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-1">All Bills</h1>
          <p className="text-sm text-muted-foreground">
            Browse bills introduced in Congress
            {congressInfo && (
              <span className="ml-1">
                ({congressInfo.startYear}–{congressInfo.endYear})
              </span>
            )}
          </p>
        </div>
        <div className="text-sm text-muted-foreground">
          Showing {bills.length} out of {totalBills} bills
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Mobile Filter Button */}
        <div className="lg:hidden mb-4">
          <Sheet open={isFilterSheetOpen} onOpenChange={setIsFilterSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filters
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <div className="h-full flex flex-col">
                <div className="flex-1 overflow-y-auto">
                  <BillsFilter
                    statusFilter={pendingFilters.status}
                    introducedDateFilter={pendingFilters.introducedDate}
                    lastActionDateFilter={pendingFilters.lastActionDate}
                    sponsorFilter={sponsorFilter}
                    titleFilter={titleFilter}
                    stateFilter={pendingFilters.state}
                    policyAreaFilter={pendingFilters.policyArea}
                    billTypeFilter={pendingFilters.billType}
                    onStatusChange={(value) => handlePendingFilterChange('status', value)}
                    onIntroducedDateChange={(value) => handlePendingFilterChange('introducedDate', value)}
                    onLastActionDateChange={(value) => handlePendingFilterChange('lastActionDate', value)}
                    onSponsorChange={setSponsorFilter}
                    onTitleChange={setTitleFilter}
                    onStateChange={(value) => handlePendingFilterChange('state', value)}
                    onPolicyAreaChange={(value) => handlePendingFilterChange('policyArea', value)}
                    onBillTypeChange={(value) => handlePendingFilterChange('billType', value)}
                    onClearAllFilters={handleClearAllFilters}
                    isMobile={true}
                  />
                </div>
                <div className="py-4 border-t">
                  <Button 
                    className="w-full" 
                    onClick={handleApplyFilters}
                    disabled={!hasFilterChanges}
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Desktop Sidebar Filters */}
        <aside className="hidden lg:block lg:w-[300px] shrink-0">
          <div className="space-y-6">
            <BillsFilter
              statusFilter={pendingFilters.status}
              introducedDateFilter={pendingFilters.introducedDate}
              lastActionDateFilter={pendingFilters.lastActionDate}
              sponsorFilter={sponsorFilter}
              titleFilter={titleFilter}
              stateFilter={pendingFilters.state}
              policyAreaFilter={pendingFilters.policyArea}
              billTypeFilter={pendingFilters.billType}
              onStatusChange={(value) => handlePendingFilterChange('status', value)}
              onIntroducedDateChange={(value) => handlePendingFilterChange('introducedDate', value)}
              onLastActionDateChange={(value) => handlePendingFilterChange('lastActionDate', value)}
              onSponsorChange={setSponsorFilter}
              onTitleChange={setTitleFilter}
              onStateChange={(value) => handlePendingFilterChange('state', value)}
              onPolicyAreaChange={(value) => handlePendingFilterChange('policyArea', value)}
              onBillTypeChange={(value) => handlePendingFilterChange('billType', value)}
              onClearAllFilters={handleClearAllFilters}
              isMobile={false}
            />
            <Button 
              className="w-full" 
              onClick={handleApplyFilters}
              disabled={!hasFilterChanges}
            >
              Apply Filters
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1">
          {error && (
            <div className="text-red-500 mb-6">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {isLoading ? (
              <div>Loading...</div>
            ) : bills.length > 0 ? (
              bills.map((bill) => (
                <Suspense key={bill.id} fallback={<div>Loading bill...</div>}>
                  <BillCard bill={bill} />
                </Suspense>
              ))
            ) : (
              <div className="col-span-full text-center py-8">
                No bills found matching your filters.
              </div>
            )}
          </div>

          {hasMoreBills && (
            <div className="mt-8 text-center">
              <Button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                variant="outline"
              >
                {isLoadingMore ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}