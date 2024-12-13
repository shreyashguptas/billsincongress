'use client';

import { Bill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface BillTimelineProps {
  bill: Bill;
}

export function BillTimeline({ bill }: BillTimelineProps) {
  // Define the stages a bill typically goes through
  const stages = [
    { name: 'Introduced', progress: 10 },
    { name: 'Reported', progress: 25 },
    { name: 'Passed House', progress: 50 },
    { name: 'Passed Senate', progress: 75 },
    { name: 'Became Law', progress: 100 },
  ];

  // Find the current stage based on bill's progress
  const currentStage = stages.reduce((prev, curr) => {
    return bill.progress >= curr.progress ? curr : prev;
  }, stages[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{currentStage.name}</span>
              <span className="text-muted-foreground">{bill.progress}%</span>
            </div>
            <Progress value={bill.progress} />
          </div>

          {/* Timeline */}
          <div className="space-y-4 pt-4">
            {stages.map((stage, index) => (
              <div key={stage.name} className="flex items-center gap-4">
                <div className={`h-2 w-2 rounded-full ${bill.progress >= stage.progress ? 'bg-primary' : 'bg-muted'}`} />
                <div className="flex-1">
                  <p className={`text-sm ${bill.progress >= stage.progress ? 'font-medium' : 'text-muted-foreground'}`}>
                    {stage.name}
                  </p>
                </div>
                {bill.progress >= stage.progress && (
                  <div className="text-xs text-muted-foreground">
                    {stage.progress}%
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Latest Action */}
          <div className="border-t pt-4">
            <h3 className="text-sm font-medium mb-2">Latest Action</h3>
            <p className="text-sm text-muted-foreground">{bill.latestActionText}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(bill.latestActionDate || '').toLocaleDateString()}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}