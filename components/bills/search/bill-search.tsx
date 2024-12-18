'use client';

import { Input } from '@/components/ui/input';
import { useBillsStore } from '@/lib/store/bills-store';
import { useDebounce } from '@/lib/hooks/use-debounce';
import { useEffect, useState } from 'react';

export function BillSearch() {
  const [searchInput, setSearchInput] = useState('');
  const { setSearchQuery } = useBillsStore();
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    setSearchQuery(debouncedSearch);
    useBillsStore.getState().fetchBills(true);
  }, [debouncedSearch, setSearchQuery]);

  return (
    <div className="w-full max-w-sm">
      <Input
        type="search"
        placeholder="Search bills..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="w-full"
      />
    </div>
  );
}