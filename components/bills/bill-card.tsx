import { Bill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

interface BillCardProps {
  bill: Bill;
}

export function BillCard({ bill }: BillCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-base sm:text-lg line-clamp-2">
          {bill.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Bill Info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Bill Number</p>
              <p className="text-sm sm:text-base font-medium">{bill.billType} {bill.billNumber}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Sponsor</p>
              <p className="text-sm sm:text-base font-medium">{bill.sponsorName}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Status</p>
              <p className="text-sm sm:text-base font-medium">{bill.status}</p>
            </div>
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground">Last Updated</p>
              <p className="text-sm sm:text-base font-medium">
                {new Date(bill.lastUpdated || '').toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs sm:text-sm">
              <span>Progress</span>
              <span>{bill.progress}%</span>
            </div>
            <Progress value={bill.progress} />
          </div>

          {/* Tags */}
          {bill.tags && bill.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {bill.tags.map((tag, index) => (
                <Badge key={index} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Summary */}
          {bill.summary && (
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Summary</p>
              <p className="text-sm sm:text-base line-clamp-3">{bill.summary}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}