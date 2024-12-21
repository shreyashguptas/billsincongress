'use client';

import React from 'react';
import { useEffect, useState } from 'react';
import { BillCard } from './bill-card';
import { Button } from '../ui/button';
import { Loader2 } from 'lucide-react';
import { useBillsStore } from '@/lib/store/bills-store';
import { BillInfo } from '@/lib/types/BillInfo';

export function BillsOverview({ initialBills }: { initialBills: BillInfo[] }) {
  const { bills, isLoading, error, fetchBills } = useBillsStore();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    // Only set initial bills if we don't have any bills
    if (bills.length === 0) {
      useBillsStore.setState({ 
        bills: initialBills,
        offset: initialBills.length
      });
    }
  }, [initialBills, bills.length]);

  const handleLoadMore = () => {
    fetchBills(false);
  };

  // Show initial bills during SSR and hydration
  if (!isClient) {
    return (
      <div className="space-y-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {initialBills.map((bill: BillInfo) => (
            <BillCard 
              key={`${bill.congress}-${bill.bill_number}-${bill.id}`} 
              bill={bill} 
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-4">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">      
      {bills.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-4">No bills found</p>
        </div>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {bills.map((bill: BillInfo) => (
              <BillCard 
                key={`${bill.congress}-${bill.bill_number}-${bill.id}`} 
                bill={bill} 
              />
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <Button
              onClick={handleLoadMore}
              disabled={isLoading}
              variant="outline"
              size="lg"
            >
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load More Bills
            </Button>
          </div>
        </>
      )}
    </div>
  );
}