'use client';

import { useEffect } from 'react';
import { BillCard } from '@/components/bills/bill-card';
import { useBillsStore } from '@/lib/store/bills-store';

export function FeaturedBills() {
  const { featuredBills, fetchFeaturedBills } = useBillsStore();

  useEffect(() => {
    fetchFeaturedBills();
  }, [fetchFeaturedBills]);

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold">Featured Bills</h2>
      {featuredBills.length === 0 ? (
        <p className="text-muted-foreground">No featured bills at this time.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredBills.map(bill => (
            <BillCard key={bill.id} bill={bill} />
          ))}
        </div>
      )}
    </div>
  );
} 