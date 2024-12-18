'use client';

import { Bill } from '@/lib/types';

interface BillHeaderProps {
  bill: Bill;
}

export function BillHeader({ bill }: BillHeaderProps) {
  return (
    <div className="flex flex-col space-y-4 pb-4 pt-6 md:flex-row md:items-center md:justify-between md:space-y-0 md:py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">{bill.title}</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          {bill.billType} {bill.billNumber} • Congress {bill.congressNumber}
        </p>
      </div>
      <div className="flex flex-wrap gap-4 md:flex-nowrap">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Latest Action</p>
          <p className="font-medium">{new Date(bill.latestActionDate || '').toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
}