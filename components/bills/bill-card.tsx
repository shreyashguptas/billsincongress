import { Bill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface BillCardProps {
  bill: Bill;
  showSponsor?: boolean;
}

export function BillCard({ bill, showSponsor = true }: BillCardProps) {
  // Fetch expanded bill type from database
  const [expandedBillType, setExpandedBillType] = useState<string>('');

  useEffect(() => {
    async function fetchExpandedBillType() {
      const { data } = await supabase
        .from('bills')
        .select('bill_type')
        .eq('id', bill.id)
        .single();
      
      if (data) {
        setExpandedBillType(data.bill_type);
      }
    }
    fetchExpandedBillType();
  }, [bill.id]);

  return (
    <Link href={`/bills/${bill.id}`} className="block transition-transform hover:scale-[1.02]">
      <Card className="h-full hover:shadow-lg transition-shadow">
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">
            {bill.title}
          </CardTitle>
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
            {/* Bill Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs sm:text-sm text-muted-foreground">Bill Number</p>
                <p className="text-sm sm:text-base font-medium">
                  {expandedBillType} {bill.billNumber}
                </p>
              </div>
              {showSponsor && (
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Sponsor</p>
                  <p className="text-sm sm:text-base font-medium">{bill.sponsorName}</p>
                </div>
              )}
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
    </Link>
  );
}