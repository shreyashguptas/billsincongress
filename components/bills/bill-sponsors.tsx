'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { BillInfo } from '@/lib/types/BillInfo';

interface BillSponsorsProps {
  bill: BillInfo;
}

export function BillSponsors({ bill }: BillSponsorsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Primary Sponsor</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback>
              {bill.sponsor_first_name[0]}
              {bill.sponsor_last_name[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">
              {bill.sponsor_first_name} {bill.sponsor_last_name}
            </p>
            <p className="text-sm text-muted-foreground">
              {bill.sponsor_party}-{bill.sponsor_state}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}