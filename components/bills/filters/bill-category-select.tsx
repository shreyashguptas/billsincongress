'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { categoryFilters } from '@/lib/constants/filters';
import { useBillsStore } from '@/lib/store/bills-store';

export function BillCategorySelect() {
  const { category, setCategory } = useBillsStore();

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    useBillsStore.getState().fetchBills(true);
  };

  return (
    <Select value={category} onValueChange={handleCategoryChange}>
      <SelectTrigger className="w-[140px] sm:w-[180px]">
        <SelectValue placeholder="Filter by category" />
      </SelectTrigger>
      <SelectContent>
        {categoryFilters.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}