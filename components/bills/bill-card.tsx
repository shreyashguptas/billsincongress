import { BillInfo } from '@/lib/types/BillInfo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface BillCardProps {
  bill: BillInfo;
}

export function BillCard({ bill }: BillCardProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {bill.bill_type_label} {bill.bill_number}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-2">
          {bill.title_without_number || bill.title}
        </p>
      </CardContent>
    </Card>
  );
}