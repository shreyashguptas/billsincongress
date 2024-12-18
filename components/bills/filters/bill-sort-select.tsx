'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { sortOptions } from '@/lib/constants/filters';
import { useBillsStore } from '@/lib/store/bills-store';

export function BillSortSelect() {
  const { sortBy, setSortBy } = useBillsStore();

  const handleSortChange = (value: string) => {
    setSortBy(value);
    useBillsStore.getState().fetchBills(true);
  };

  return (
    <Select value={sortBy} onValueChange={handleSortChange}>
      <SelectTrigger className="w-[140px] sm:w-[180px]">
        <SelectValue placeholder="Sort by" />
      </SelectTrigger>
      <SelectContent>
        {sortOptions.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}