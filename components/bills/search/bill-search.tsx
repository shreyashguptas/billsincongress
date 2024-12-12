'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';

export function BillSearch() {
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <div className="relative flex-1 sm:w-64">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search bills..." className="pl-8" />
      </div>
      <Button size="sm" className="whitespace-nowrap">
        Search
      </Button>
    </div>
  );
}