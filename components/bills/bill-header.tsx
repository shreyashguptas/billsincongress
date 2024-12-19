'use client';

import { Bill } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface BillHeaderProps {
  bill: Bill;
}

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).replace(/(\d+)/, '$1th').replace(/1th/, '1st').replace(/2th/, '2nd').replace(/3th/, '3rd');
}

export function BillHeader({ bill }: BillHeaderProps) {
  return (
    <div className="flex flex-col space-y-4 pb-4 pt-6 md:flex-row md:items-start md:justify-between md:space-y-0 md:py-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl lg:text-4xl">{bill.title}</h1>
        <p className="text-sm text-muted-foreground md:text-base">
          Bill Introduced On {formatDate(bill.introducedDate)}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-4 md:flex-nowrap">
        {bill.billPdfUrl && (
          <Button 
            variant="outline" 
            onClick={() => window.open(bill.billPdfUrl, '_blank')}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            View PDF
          </Button>
        )}
      </div>
    </div>
  );
}