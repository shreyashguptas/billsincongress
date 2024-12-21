'use client';

import { useEffect } from 'react';
import { useBillsStore } from '@/lib/store/bills-store';
import { BillCard } from './bill-card';

export function FeaturedBills() {
  const { featuredBills, fetchFeaturedBills, isLoading, error } = useBillsStore();

  useEffect(() => {
    fetchFeaturedBills();
  }, [fetchFeaturedBills]);

  // Debug logging
  console.log('Featured bills data:', featuredBills.map(bill => ({
    id: bill.id,
    title: bill.title,
    policyArea: bill.bill_subjects?.policy_area_name,
    bill_subjects: bill.bill_subjects
  })));

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {featuredBills.map((bill) => (
        <BillCard key={bill.id} bill={bill} />
      ))}
    </div>
  );
} 