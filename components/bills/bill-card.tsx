import { BillInfo } from '@/lib/types/BillInfo';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface BillCardProps {
  bill: BillInfo;
}

export function BillCard({ bill }: BillCardProps) {
  return (
    <Link href={`/bills/${bill.id}`}>
      <Card className="w-full h-full hover:bg-accent transition-colors">
        <CardContent className="p-6">
          <p className="text-sm text-muted-foreground mb-2">
            {bill.id}
          </p>
          <p className="text-base font-medium line-clamp-3">
            {bill.title}
          </p>
          {bill.latest_action_text && (
            <p className="text-sm text-muted-foreground mt-2">
              Latest Action: {bill.latest_action_text}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}