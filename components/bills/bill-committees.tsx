'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function BillCommittees() {
  const committees = [
    {
      name: 'Committee on Energy and Commerce',
      status: 'Primary',
    },
    {
      name: 'Subcommittee on Energy',
      status: 'Referred',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Committees</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {committees.map((committee) => (
            <div key={committee.name}>
              <p className="font-medium">{committee.name}</p>
              <p className="text-sm text-muted-foreground">{committee.status}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}