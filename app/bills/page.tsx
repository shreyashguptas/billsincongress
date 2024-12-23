'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { billsService } from '@/lib/services/bills-service';
import type { Bill } from '../../lib/types/bill';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Button } from '@/components/ui/button';

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
  const [statusFilter, setStatusFilter] = useState('all');
  const [introducedDateFilter, setIntroducedDateFilter] = useState('all');
  const [lastActionDateFilter, setLastActionDateFilter] = useState('all');
  const [sponsorFilter, setSponsorFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debouncedSponsorFilter = useDebounce(sponsorFilter, 2000);

  const handleClearAllFilters = () => {
    setStatusFilter('all');
    setIntroducedDateFilter('all');
    setLastActionDateFilter('all');
    setSponsorFilter('');
    setStateFilter('all');
    setCurrentPage(1);
    setBills([]);
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
        stateFilter: stateFilter,
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
          stateFilter: stateFilter,
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
  }, [statusFilter, introducedDateFilter, lastActionDateFilter, debouncedSponsorFilter, stateFilter]);

  const hasMoreBills = bills.length < totalBills;

  return (
    <main className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">All Bills</h1>
        <span className="text-sm text-muted-foreground">
          Showing {bills.length} out of {totalBills} bills
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <BillsFilter
            statusFilter={statusFilter}
            introducedDateFilter={introducedDateFilter}
            lastActionDateFilter={lastActionDateFilter}
            sponsorFilter={sponsorFilter}
            stateFilter={stateFilter}
            onStatusChange={setStatusFilter}
            onIntroducedDateChange={setIntroducedDateFilter}
            onLastActionDateChange={setLastActionDateFilter}
            onSponsorChange={setSponsorFilter}
            onStateChange={setStateFilter}
            onClearAllFilters={handleClearAllFilters}
          />
        </div>
        {error && (
          <div className="text-red-500 mb-4">
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <div>Loading...</div>
          ) : bills.length > 0 ? (
            bills.map((bill) => (
              <Suspense key={bill.id} fallback={<div>Loading bill...</div>}>
                <BillCard bill={bill} />
              </Suspense>
            ))
          ) : (
            <div>No bills found</div>
          )}
        </div>
        {hasMoreBills && !isLoading && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="outline"
              onClick={handleLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? 'Loading...' : 'Load More'}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}