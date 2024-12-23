import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Bill } from "@/lib/types/bill";
import Link from "next/link";

interface BillCardProps {
  bill: Bill;
}

export function BillCard({ bill }: BillCardProps) {
  const policyArea = bill.bill_subjects?.policy_area_name;
  const shouldShowBadge = policyArea != null && policyArea !== '';

  return (
    <Link href={`/bills/${bill.id}`}>
      <Card className="h-full hover:bg-accent/50 transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <h3 className="text-xl font-semibold">
              {bill.title}
            </h3>
            {shouldShowBadge && (
              <Badge variant="outline" className="whitespace-nowrap">
                {policyArea}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {bill.bill_type_label} {bill.bill_number}
              </span>
              <span>{bill.progress_description}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Sponsored by {bill.sponsor_first_name} {bill.sponsor_last_name} ({bill.sponsor_party}-{bill.sponsor_state})
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}