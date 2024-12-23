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
  const policyArea = bill.bill_subjects?.policy_area_name;
  const shouldShowBadge = policyArea !== null && policyArea !== '';

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <Link href={`/bills/${bill.id}`}>
      <Card className="h-full hover:bg-accent/50 transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold">
                {bill.title}
              </h3>
              <div className="text-sm text-muted-foreground">
                Sponsored by {bill.sponsor_first_name} {bill.sponsor_last_name}
              </div>
              <div className="text-sm text-muted-foreground">
                Introduced on {formatDate(bill.introduced_date)}
              </div>
            </div>
            {shouldShowBadge && (
              <Badge variant="outline" className="whitespace-nowrap shrink-0">
                {policyArea}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <BillProgress
              stage={Number(bill.progress_stage)}
              description={bill.progress_description}
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}