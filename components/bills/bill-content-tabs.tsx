'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BillTimeline } from './bill-timeline';
import { BillInfo } from '@/lib/types/BillInfo';

interface BillContentTabsProps {
  bill: BillInfo;
}

export function BillContentTabs({ bill }: BillContentTabsProps) {
  return (
    <Tabs defaultValue="summary" className="space-y-4">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
      </TabsList>
      <TabsContent value="summary">
        <Card>
          <CardHeader>
            <CardTitle>Bill Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {bill.title_without_number || bill.title}
            </p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="timeline">
        <Card>
          <CardHeader>
            <CardTitle>Bill Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <BillTimeline bill={bill} />
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}