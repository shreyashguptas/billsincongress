import { BillInfo } from '@/lib/types/BillInfo';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface BillCardProps {
  bill: BillInfo;
}

export function BillCard({ bill }: BillCardProps) {
  const policyArea = bill.bill_subjects?.policy_area_name;
  const progressStage = bill.progress_stage || 0;

  // Debug logging
  console.log('Bill data:', {
    id: bill.id,
    title: bill.title,
    policyArea,
    bill_subjects: bill.bill_subjects
  });

  return (
    <Link href={`/bills/${bill.id}`}>
      <Card className="w-full h-full hover:bg-accent transition-colors">
        <CardContent className="p-6">
          <div className="flex flex-col gap-4">
            <div className="space-y-3">
              <h3 className="text-xl font-semibold line-clamp-3">
                {bill.title}
              </h3>
              {policyArea && (
                <Badge 
                  variant="secondary" 
                  className="text-xs font-medium px-3 py-1 bg-primary/10 text-primary hover:bg-primary/20"
                >
                  {policyArea}
                </Badge>
              )}
            </div>
            <div className="text-sm space-y-2">
              <p className="text-primary font-medium">{bill.sponsor_first_name} {bill.sponsor_last_name}</p>
              <p className="text-muted-foreground">Introduced: {new Date(bill.introduced_date).toLocaleDateString()}</p>
              {bill.progress_description && (
                <div className="space-y-1.5">
                  <p className="text-muted-foreground">Status: {bill.progress_description}</p>
                  <Progress value={progressStage} className="h-2" />
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}