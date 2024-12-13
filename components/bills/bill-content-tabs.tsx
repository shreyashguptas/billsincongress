'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';
import { BillTimeline } from './bill-timeline';
import { Bill } from '@/lib/types';

interface BillContentTabsProps {
  bill: Bill;
}

export function BillContentTabs({ bill }: BillContentTabsProps) {
  return (
    <Tabs defaultValue="summary" className="space-y-4">
      <TabsList>
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="timeline">Timeline</TabsTrigger>
        <TabsTrigger value="fulltext">Full Text</TabsTrigger>
      </TabsList>
      <TabsContent value="summary">
        <Card>
          <CardHeader>
            <CardTitle>Bill Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{bill.summary}</p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="timeline">
        <BillTimeline bill={bill} />
      </TabsContent>
      <TabsContent value="fulltext">
        <Card>
          <CardHeader>
            <CardTitle>Full Text</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Full text of the bill will be displayed here when available.
            </p>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}