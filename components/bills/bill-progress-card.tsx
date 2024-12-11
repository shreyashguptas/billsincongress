'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Bill } from '@/lib/types';

interface BillProgressCardProps {
  bill: Bill;
}

export function BillProgressCard({ bill }: BillProgressCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between text-sm">
            <span>Current Status: <span className="font-medium">{bill.status}</span></span>
            <span>{bill.progress}%</span>
          </div>
          <Progress value={bill.progress} className="h-2" />
        </div>
      </CardContent>
    </Card>
  );
}