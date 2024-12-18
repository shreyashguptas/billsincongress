'use client';

import { Button } from '@/components/ui/button';
import { BillSortSelect } from './bill-sort-select';
import { BillStatusSelect } from './bill-status-select';
import { BillCategorySelect } from './bill-category-select';
import { useBillsStore } from '@/lib/store/bills-store';

export function BillFilters() {
  const clearFilters = useBillsStore(state => state.clearFilters);

  return (
    <div className="flex flex-nowrap gap-2 md:gap-4 min-w-max">
      <BillSortSelect />
      <BillStatusSelect />
      <BillCategorySelect />
      <Button 
        variant="outline" 
        size="sm" 
        className="whitespace-nowrap"
        onClick={clearFilters}
      >
        Clear Filters
      </Button>
    </div>
  );
}