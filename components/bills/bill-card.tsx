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
  // Log the bill data to see what we're getting
  console.log('Bill data in card:', {
    id: bill.id,
    policyArea: bill.bill_subjects?.policy_area_name
  });

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
          <div className="space-y-3">
            <h3 className="text-lg font-semibold leading-tight">
              {bill.title}
            </h3>
            <div className="space-y-1">
              <div className="text-sm text-muted-foreground">
                Sponsored by {bill.sponsor_first_name} {bill.sponsor_last_name}
              </div>
              <div className="text-sm text-muted-foreground">
                Introduced on {formatDate(bill.introduced_date)}
              </div>
              {bill.bill_subjects?.policy_area_name && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="secondary" className="text-xs">
                    {bill.bill_subjects.policy_area_name}
                  </Badge>
                </div>
              )}
            </div>
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