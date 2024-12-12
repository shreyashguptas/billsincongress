'use client';

import { BillSearch } from './search/bill-search';
import { BillFilters } from './filters/bill-filters';

export function BillsHeader() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Congressional Bills
        </h1>
        <BillSearch />
      </div>
      <div className="overflow-x-auto pb-2">
        <BillFilters />
      </div>
    </div>
  );
}