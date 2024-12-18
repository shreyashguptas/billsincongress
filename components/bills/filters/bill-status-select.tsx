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

export function BillStatusSelect() {
  const { status, setStatus, uniqueStatuses, fetchUniqueValues } = useBillsStore();

  useEffect(() => {
    fetchUniqueValues();
  }, [fetchUniqueValues]);

  const handleStatusChange = (value: string) => {
    setStatus(value);
    useBillsStore.getState().fetchBills(true);
  };

  return (
    <Select value={status} onValueChange={handleStatusChange}>
      <SelectTrigger className="w-[140px] sm:w-[180px]">
        <SelectValue placeholder="Filter by status" />
      </SelectTrigger>
      <SelectContent>
        {uniqueStatuses.map((value) => (
          <SelectItem key={value} value={value}>
            {value.charAt(0).toUpperCase() + value.slice(1)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}