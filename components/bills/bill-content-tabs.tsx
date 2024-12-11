'use client';

import { Card, CardContent } from '@/components/ui/card';
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
      <TabsContent value="summary" className="space-y-4">
        <Card>
          <CardContent className="pt-6">
            <p className="leading-7">{bill.summary}</p>
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="timeline">
        <BillTimeline />
      </TabsContent>
      <TabsContent value="fulltext">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-muted-foreground">Full text of the bill</p>
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}