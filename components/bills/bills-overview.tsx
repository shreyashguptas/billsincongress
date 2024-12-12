'use client';

import { BillCard } from './bill-card';
import { useMemo, useState } from 'react';
import { mockBills } from '@/lib/mock-data';

export function BillsOverview() {
  const [currentPage] = useState(1);
  const billsPerPage = 9;

  const paginatedBills = useMemo(() => {
    const start = (currentPage - 1) * billsPerPage;
    const end = start + billsPerPage;
    return mockBills.slice(start, end);
  }, [currentPage]);

  return (
    <div className="grid gap-4 sm:gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {paginatedBills.map((bill) => (
        <BillCard key={bill.id} bill={bill} />
      ))}
    </div>
  );
}