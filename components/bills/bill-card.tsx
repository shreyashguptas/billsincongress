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
        <CardHeader className="space-y-2">
          <CardTitle className="line-clamp-2 text-base sm:text-lg">
            {bill.title}
          </CardTitle>
          <div className="flex flex-wrap gap-1.5">
            {bill.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 sm:space-y-4">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Sponsor</p>
              <p className="text-sm sm:text-base font-medium">{bill.sponsor}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Status</p>
              <p className="text-sm sm:text-base font-medium">{bill.status}</p>
            </div>
            <div>
              <p className="mb-1.5 text-xs sm:text-sm text-muted-foreground">Progress</p>
              <Progress value={bill.progress} className="h-2" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}