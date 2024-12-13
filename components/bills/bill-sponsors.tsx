'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Bill } from '@/lib/types';

interface BillSponsorsProps {
  bill: Bill;
}

export function BillSponsors({ bill }: BillSponsorsProps) {
  // Function to get initials from name
  function getInitials(name: string): string {
    return name
      .split(' ')
      .map(part => part[0])
      .join('')
      .toUpperCase();
  }

  // Function to get party color
  function getPartyColor(party: string): string {
    switch (party.toUpperCase()) {
      case 'D':
        return 'bg-blue-100';
      case 'R':
        return 'bg-red-100';
      default:
        return 'bg-gray-100';
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sponsors</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Primary Sponsor */}
          <div className="flex items-center space-x-4">
            <Avatar className={getPartyColor(bill.sponsorParty)}>
              <AvatarFallback>
                {getInitials(bill.sponsorName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{bill.sponsorName}</p>
              <p className="text-sm text-muted-foreground">
                {bill.sponsorParty}-{bill.sponsorState} • Primary Sponsor
              </p>
            </div>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Committee Count: {bill.committeeCount}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}