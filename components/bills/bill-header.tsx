'use client';

import { Bill } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';

interface BillHeaderProps {
  bill: Bill;
}

export function BillHeader({ bill }: BillHeaderProps) {
  return (
    <div className="flex flex-col space-y-4 pb-4 pt-6 md:flex-row md:items-center md:justify-between md:space-y-0 md:py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">{bill.title}</h1>
        <p className="text-sm text-muted-foreground">
          {bill.billType} {bill.billNumber} • Congress {bill.congressNumber}
        </p>
      </div>
      <div className="flex items-center space-x-4">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Latest Action</p>
          <p className="font-medium">{new Date(bill.latestActionDate || '').toLocaleDateString()}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Sponsor</p>
          <p className="font-medium">{bill.sponsorName}</p>
        </div>
        <Button variant="outline" size="sm">
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </div>
    </div>
  );
}