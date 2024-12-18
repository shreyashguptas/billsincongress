'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BillTimeline } from './bill-timeline';
import { Bill } from '@/lib/types';

interface BillContentTabsProps {
  bill: Bill;
}

export function BillContentTabs({ bill }: BillContentTabsProps) {
  return (
    <div className="space-y-8">
      {/* Summary Section */}
      <Card>
        <CardHeader>
          <CardTitle>Bill Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground md:text-base">{bill.summary}</p>
        </CardContent>
      </Card>

      {/* Timeline Section */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <BillTimeline bill={bill} />
        </CardContent>
      </Card>

      {/* Full Text Section */}
      <Card>
        <CardHeader>
          <CardTitle>Full Text</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground md:text-base">
            Full text of the bill will be displayed here when available.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}