'use client';

import React from 'react';
import { useEffect } from 'react';
import { BillCard } from './bill-card';
import { useBillsStore } from '@/lib/store/bills-store';
import { BillInfo } from '@/lib/types/BillInfo';

export function BillsOverview({ initialBills }: { initialBills: BillInfo[] }) {
  const { bills, isLoading, error, fetchBills } = useBillsStore();

  useEffect(() => {
    // Initialize the store with initial bills
    useBillsStore.setState({ bills: initialBills, offset: initialBills.length });
    // Then fetch bills from the API
    fetchBills();
  }, [initialBills, fetchBills]);

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-red-500 mb-4">Error: {error}</p>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 mb-4">No bills found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {bills.map((bill: BillInfo) => (
        <BillCard 
          key={bill.id} 
          bill={bill} 
        />
      ))}
    </div>
  );
}