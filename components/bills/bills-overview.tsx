'use client';

import { useEffect } from 'react';
import { BillCard } from './bill-card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { useBillsStore } from '@/lib/store/bills-store';
import { Bill } from '@/lib/types';

export function BillsOverview({ initialBills }: { initialBills: Bill[] }) {
  const { bills, loading, error, fetchBills } = useBillsStore();

  useEffect(() => {
    useBillsStore.setState({ bills: initialBills });
  }, [initialBills]);

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
            {bills.map((bill: Bill) => (
              <BillCard 
                key={`${bill.congressNumber}-${bill.billNumber}-${bill.id}`} 
                bill={bill} 
              />
            ))}
          </div>
          <div className="mt-8 flex justify-center">
            <Button
              onClick={() => fetchBills()}
              disabled={loading}
              variant="outline"
              size="lg"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Load More Bills
            </Button>
          </div>
        </>
      )}
    </div>
  );
}