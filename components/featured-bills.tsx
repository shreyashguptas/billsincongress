'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import Link from 'next/link';

export function FeaturedBills() {
  const [loading] = useState(false);

  const bills = [
    {
      id: 'hr1234',
      title: 'Clean Energy Innovation Act of 2024',
      sponsor: 'Rep. John Smith',
      introduced: '2024-03-15',
      status: 'In Committee',
      progress: 25,
      summary: 'A comprehensive bill to accelerate clean energy development...',
      tags: ['Energy', 'Environment', 'Innovation'],
    },
    {
      id: 'hr5678',
      title: 'Digital Privacy Protection Act',
      sponsor: 'Rep. Sarah Johnson',
      introduced: '2024-03-10',
      status: 'Passed House',
      progress: 65,
      summary: 'Strengthening online privacy protections for consumers...',
      tags: ['Technology', 'Privacy', 'Consumer Protection'],
    },
    // Add more mock bills as needed
  ];

  if (loading) {
    return (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-24" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {bills.map((bill) => (
        <Link href={`/bills/${bill.id}`} key={bill.id}>
          <Card className="h-full transition-shadow hover:shadow-lg">
            <CardHeader>
              <CardTitle className="line-clamp-2 text-lg">{bill.title}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {bill.tags.map((tag) => (
                  <Badge key={tag} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Sponsor</p>
                  <p className="font-medium">{bill.sponsor}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <p className="font-medium">{bill.status}</p>
                </div>
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Progress</p>
                  <Progress value={bill.progress} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}