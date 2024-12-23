'use client';

import { useEffect, useState } from 'react';
import { BillsFilter } from '@/components/bills/bills-filter';
import { BillCard } from '@/components/bills/bill-card';
import { billsService } from '@/lib/services/bills-service';
import type { Bill } from '../../lib/types/bill';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { Button } from '@/components/ui/button';

const ITEMS_PER_PAGE = 5;

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
      console.error('Error loading more bills:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    const fetchBills = async () => {
      setIsLoading(true);
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
        console.error('Error fetching bills:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBills();
  }, [statusFilter, introducedDateFilter, lastActionDateFilter, debouncedSponsorFilter, stateFilter]);

  const hasMoreBills = bills.length < totalBills;

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">All Bills</h1>
      <div className="mb-8">
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
      <div className="grid gap-6">
        {isLoading ? (
          <div>Loading...</div>
        ) : bills.length > 0 ? (
          bills.map((bill) => <BillCard key={bill.id} bill={bill} />)
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
    </main>
  );
}