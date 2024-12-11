'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export function BillRelated() {
  const relatedBills = [
    {
      id: 'hr5679',
      title: 'Renewable Energy Development Act',
      congress: '118th',
    },
    {
      id: 'hr5680',
      title: 'Clean Air Enhancement Act',
      congress: '118th',
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Related Bills</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {relatedBills.map((bill) => (
            <Link
              key={bill.id}
              href={`/bills/${bill.id}`}
              className="block space-y-1 hover:opacity-80"
            >
              <p className="font-medium">{bill.title}</p>
              <p className="text-sm text-muted-foreground">
                {bill.id.toUpperCase()} ({bill.congress})
              </p>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}