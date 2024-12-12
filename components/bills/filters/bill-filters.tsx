'use client';

import { Button } from '@/components/ui/button';
import { BillSortSelect } from './bill-sort-select';
import { BillStatusSelect } from './bill-status-select';
import { BillCategorySelect } from './bill-category-select';

export function BillFilters() {
  return (
    <div className="flex flex-nowrap gap-2 md:gap-4 min-w-max">
      <BillSortSelect />
      <BillStatusSelect />
      <BillCategorySelect />
      <Button variant="outline" size="sm" className="whitespace-nowrap">
        Clear Filters
      </Button>
    </div>
  );
}