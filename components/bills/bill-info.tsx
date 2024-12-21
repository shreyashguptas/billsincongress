import type { BillInfo } from '@/lib/types/BillInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BillInfoProps {
  bill: BillInfo;
}

export function BillInfo({ bill }: BillInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Bill Information</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm font-medium">Congress</p>
            <p className="text-sm text-muted-foreground">{bill.congress}</p>
          </div>
          <div>
            <p className="text-sm font-medium">Bill Type</p>
            <p className="text-sm text-muted-foreground">{bill.bill_type_label}</p>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium">Introduced Date</p>
          <p className="text-sm text-muted-foreground">{bill.introduced_date}</p>
        </div>
        {bill.latest_action_text && (
          <div>
            <p className="text-sm font-medium">Latest Action</p>
            <p className="text-sm text-muted-foreground">
              {bill.latest_action_text} ({bill.latest_action_date})
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 