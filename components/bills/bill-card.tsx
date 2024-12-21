import { BillInfo } from '@/lib/types/BillInfo';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface BillCardProps {
  bill: BillInfo;
}

export function BillCard({ bill }: BillCardProps) {
  const policyArea = bill.bill_subjects?.policy_area_name;

  return (
    <Link href={`/bills/${bill.id}`}>
      <Card className="w-full h-full hover:bg-accent transition-colors">
        <CardContent className="p-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{bill.bill_type_label} {bill.bill_number}</span>
              <span className="text-sm text-muted-foreground">({bill.congress}th Congress)</span>
            </div>
            <h3 className="text-base font-medium line-clamp-3">
              {bill.title}
            </h3>
            <div className="text-sm text-muted-foreground">
              <p>Sponsored by: {bill.sponsor_first_name} {bill.sponsor_last_name} ({bill.sponsor_party}-{bill.sponsor_state})</p>
              <p>Introduced: {new Date(bill.introduced_date).toLocaleDateString()}</p>
              {bill.latest_action_text && (
                <p className="mt-2">Latest Action: {bill.latest_action_text}</p>
              )}
              {policyArea && (
                <p className="mt-2 text-sm font-medium text-primary">Category: {policyArea}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}