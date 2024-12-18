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
    <div className="mx-auto max-w-[1200px]">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {featuredBills.map((bill) => (
          <BillCard key={bill.id} bill={bill} showSponsor={false} />
        ))}
      </div>
    </div>
  );
}