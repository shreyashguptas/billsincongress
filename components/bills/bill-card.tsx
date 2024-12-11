import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import Link from 'next/link';
import { Bill } from '@/lib/types';

interface BillCardProps {
  bill: Bill;
}

export function BillCard({ bill }: BillCardProps) {
  return (
    <Link href={`/bills/${bill.id}`}>
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
  );
}