'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Bill } from '@/lib/types';

interface BillSponsorsProps {
  bill: Bill;
}

export function BillSponsors({ bill }: BillSponsorsProps) {
  const cosponsors = [
    {
      name: 'Rep. Jane Wilson',
      party: 'D',
      state: 'CA',
      image: 'https://i.pravatar.cc/150?u=jane',
    },
    {
      name: 'Rep. Mark Davis',
      party: 'R',
      state: 'TX',
      image: 'https://i.pravatar.cc/150?u=mark',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sponsors</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-10 w-10">
              <AvatarImage src="https://i.pravatar.cc/150?u=john" />
              <AvatarFallback>JS</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium">{bill.sponsor}</p>
              <p className="text-sm text-muted-foreground">Primary Sponsor</p>
            </div>
          </div>
          <div className="border-t pt-4">
            <p className="mb-3 text-sm font-medium">Co-Sponsors</p>
            <div className="space-y-3">
              {cosponsors.map((cosponsor) => (
                <div key={cosponsor.name} className="flex items-center gap-4">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={cosponsor.image} />
                    <AvatarFallback>
                      {cosponsor.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium">{cosponsor.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {cosponsor.party}-{cosponsor.state}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}