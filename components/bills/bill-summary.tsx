import { Bill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface BillSummaryProps {
  bill: Bill;
}

export function BillSummary({ bill }: BillSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Latest Action */}
          <div>
            <h3 className="font-medium mb-2">Latest Action</h3>
            <p className="text-sm text-muted-foreground">{bill.latestActionText}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(bill.latestActionDate || '').toLocaleDateString()}
            </p>
          </div>

          {/* Summary */}
          <div>
            <h3 className="font-medium mb-2">Bill Summary</h3>
            <p className="text-sm text-muted-foreground">{bill.summary}</p>
          </div>

          {/* Tags */}
          {bill.tags && bill.tags.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Topics</h3>
              <div className="flex flex-wrap gap-2">
                {bill.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 