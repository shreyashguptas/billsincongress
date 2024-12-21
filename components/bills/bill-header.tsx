'use client';

import { BillInfo } from '@/lib/types/BillInfo';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface BillHeaderProps {
  bill: BillInfo;
}

export function BillHeader({ bill }: BillHeaderProps) {
  return (
    <div className="space-y-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {bill.bill_type_label} {bill.bill_number}
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {bill.title_without_number || bill.title}
          </p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            View Full Text
          </Button>
        </div>
      </div>
    </div>
  );
}