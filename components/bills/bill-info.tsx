import { Bill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BillInfoProps {
  bill: Bill;
}

export function BillInfo({ bill }: BillInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Bill Number</p>
              <p className="font-medium">
                {bill.billType} {bill.billNumber}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Congress</p>
              <p className="font-medium">{bill.congressNumber}th Congress</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Origin Chamber</p>
              <p className="font-medium">{bill.originChamber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Latest Action Date</p>
              <p className="font-medium">
                {new Date(bill.latestActionDate || '').toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 