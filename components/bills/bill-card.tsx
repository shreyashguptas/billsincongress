'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Bill } from '@/lib/types/bill';
import { BillProgress } from './bill-progress';
import Link from 'next/link';

interface BillCardProps {
  bill: Bill;
}

export default function BillCard({ bill }: BillCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Link href={`/bills/${bill.id}`}>
      <Card className="h-full hover:bg-accent/50 transition-colors overflow-hidden">
        {/* Top section with policy area and date */}
        <div className="p-4">
          <div className="flex justify-between items-baseline mb-2">
            <div className="text-xs text-muted-foreground">
              {formatDate(bill.introduced_date)}
            </div>
          </div>
          {bill.bill_subjects?.policy_area_name && (
            <div className="text-sm font-medium text-primary/80">
              {bill.bill_subjects.policy_area_name}
            </div>
          )}
        </div>

        {/* Main content */}
        <CardContent className="space-y-4 p-4 pt-0">
          {/* Title with truncation */}
          <h3 className="font-medium leading-snug line-clamp-2 min-h-[48px]">
            {bill.title}
          </h3>

          {/* Progress bar */}
          <BillProgress
            stage={Number(bill.progress_stage)}
            description={bill.progress_description}
          />

          {/* Sponsor info */}
          <div className="flex items-center gap-2 pt-2">
            <div className="h-8 w-8 rounded-full bg-accent flex items-center justify-center">
              <span className="text-sm font-medium">
                {bill.sponsor_first_name[0]}{bill.sponsor_last_name[0]}
              </span>
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">
                {bill.sponsor_first_name} {bill.sponsor_last_name}
              </div>
              <div className="text-xs text-muted-foreground">
                Primary Sponsor
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}