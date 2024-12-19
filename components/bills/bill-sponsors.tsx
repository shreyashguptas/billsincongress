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

  // Function to get full party name
  function getFullPartyName(party: string): string {
    switch (party.toUpperCase()) {
      case 'D':
        return 'Democrat';
      case 'R':
        return 'Republican';
      default:
        return 'Independent';
    }
  }

  // Function to get full state name
  function getFullStateName(stateCode: string): string {
    const states: { [key: string]: string } = {
      'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
      'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
      'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
      'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
      'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
      'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
      'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
      'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
      'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
      'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
      'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
      'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
      'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
    };
    return states[stateCode] || stateCode;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill Sponsor</CardTitle>
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
            <div className="space-y-1">
              <p className="font-medium">{bill.sponsorName}</p>
              <p className="text-sm text-muted-foreground">
                State: {getFullStateName(bill.sponsorState)}
              </p>
              <p className="text-sm text-muted-foreground">
                Party: {getFullPartyName(bill.sponsorParty)}
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
                Co-Sponsors Count: {bill.cosponsorsCount}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}