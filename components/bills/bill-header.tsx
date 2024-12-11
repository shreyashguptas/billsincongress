'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Share2 } from 'lucide-react';
import { Bill } from '@/lib/types';

interface BillHeaderProps {
  bill: Bill;
}

export function BillHeader({ bill }: BillHeaderProps) {
  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight mb-4">{bill.title}</h1>
      <div className="flex flex-wrap gap-2 mb-4">
        {bill.tags.map((tag) => (
          <Badge key={tag} variant="secondary">
            {tag}
          </Badge>
        ))}
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Introduced</p>
          <p className="font-medium">{bill.introduced}</p>
        </div>
        <Button variant="outline" size="sm">
          <Share2 className="mr-2 h-4 w-4" />
          Share
        </Button>
      </div>
    </div>
  );
}