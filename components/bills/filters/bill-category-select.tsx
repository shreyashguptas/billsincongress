'use client';

import { useEffect } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useBillsStore } from '@/lib/store/bills-store';

export function BillCategorySelect() {
  const { category, setCategory, uniqueTags, fetchUniqueValues } = useBillsStore();

  useEffect(() => {
    fetchUniqueValues();
  }, [fetchUniqueValues]);

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
        {uniqueTags.map((value) => (
          <SelectItem key={value} value={value}>
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}