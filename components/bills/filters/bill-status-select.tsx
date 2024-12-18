'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { statusFilters } from '@/lib/constants/filters';
import { useBillsStore } from '@/lib/store/bills-store';

export function BillStatusSelect() {
  const { status, setStatus } = useBillsStore();

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
        {statusFilters.map(({ value, label }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}