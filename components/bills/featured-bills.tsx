'use client';

import { useEffect, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useBillsStore } from '@/lib/store/bills-store';

const BillCard = dynamic(
  () => import('@/components/bills/bill-card'),
  { ssr: false }
);

export function FeaturedBills() {
  const { featuredBills, fetchFeaturedBills } = useBillsStore();

  useEffect(() => {
    fetchFeaturedBills();
  }, [fetchFeaturedBills]);

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-bold">Featured Bills</h2>
      {featuredBills?.length === 0 ? (
        <p className="text-muted-foreground">No featured bills at this time.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {featuredBills?.map(bill => (
            <Suspense key={bill.id} fallback={<div>Loading bill...</div>}>
              <BillCard bill={bill} />
            </Suspense>
          ))}
        </div>
      )}
    </div>
  );
} 