'use client';

import { useEffect, useState } from 'react';
import { BillCard } from '@/components/bills/bill-card';
import { BillsFilter } from '@/components/bills/bills-filter';
import { billsService } from '@/lib/services/bills-service';
import { BillInfo } from '@/lib/types/BillInfo';

export default function BillsPage() {
  const [bills, setBills] = useState<BillInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [sponsorFilter, setSponsorFilter] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [debouncedSponsorFilter, setDebouncedSponsorFilter] = useState('');

  // Handle sponsor filter debouncing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSponsorFilter(sponsorFilter);
    }, 2000); // 2 seconds delay

    return () => clearTimeout(timer);
  }, [sponsorFilter]);

  // Fetch bills when filters change
  useEffect(() => {
    async function fetchBills() {
      try {
        setIsLoading(true);
        setError(null);
        const response = await billsService.fetchBills({
          status: statusFilter,
          dateFilter: dateFilter,
          sponsorFilter: debouncedSponsorFilter,
          stateFilter: stateFilter,
        });

        if (response.error) {
          throw response.error;
        }

        setBills(response.data);
      } catch (err) {
        console.error('Error fetching bills:', err);
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchBills();
  }, [statusFilter, dateFilter, debouncedSponsorFilter, stateFilter]);

  return (
    <div className="container mx-auto py-8">
      <div className="flex flex-col gap-6">
        <div className="space-y-6">
          <h1 className="text-2xl font-bold">Latest Bills</h1>
          <BillsFilter
            statusFilter={statusFilter}
            dateFilter={dateFilter}
            sponsorFilter={sponsorFilter}
            stateFilter={stateFilter}
            onStatusChange={setStatusFilter}
            onDateChange={setDateFilter}
            onSponsorChange={setSponsorFilter}
            onStateChange={setStateFilter}
          />
        </div>

        {isLoading ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading bills...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500">Error loading bills. Please try again later.</p>
          </div>
        ) : bills.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No bills found matching your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bills.map((bill) => (
              <BillCard key={bill.id} bill={bill} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}