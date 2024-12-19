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
    { name: 'Introduced' },
    { name: 'Reported' },
    { name: 'Passed House' },
    { name: 'Passed Senate' },
    { name: 'Became Law' },
  ];

  // Calculate the current stage index based on bill's status
  const getCurrentStageIndex = () => {
    switch (bill.status.toLowerCase()) {
      case 'introduced':
        return 0;
      case 'reported':
      case 'in committee':
        return 1;
      case 'passed house':
        return 2;
      case 'passed senate':
        return 3;
      case 'enacted':
      case 'became law':
        return 4;
      case 'vetoed':
        return 2; // Show progress up to House passage for vetoed bills
      case 'failed':
      case 'rejected':
        return Math.max(stages.findIndex(stage => 
          stage.name.toLowerCase() === bill.latestActionText.toLowerCase()
        ) - 1, 0);
      default:
        return 0;
    }
  };

  const currentStageIndex = getCurrentStageIndex();
  const currentStage = stages[currentStageIndex];
  
  // Special status handling
  const isVetoed = bill.status.toLowerCase() === 'vetoed';
  const isFailed = ['failed', 'rejected'].includes(bill.status.toLowerCase());

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
              <span className="font-medium">
                {isVetoed ? 'Vetoed' : isFailed ? 'Failed' : currentStage.name}
              </span>
              <span className="text-muted-foreground">{bill.progress}%</span>
            </div>
            <Progress value={bill.progress} className={isVetoed || isFailed ? 'opacity-50' : ''} />
          </div>

          {/* Timeline */}
          <div className="space-y-4 pt-4">
            {stages.map((stage, index) => {
              const isCompleted = index <= currentStageIndex;
              const isCurrent = index === currentStageIndex;
              const isDisabled = (isVetoed || isFailed) && index > currentStageIndex;
              
              return (
                <div key={stage.name} className="flex items-center gap-4">
                  <div 
                    className={`h-2 w-2 rounded-full ${
                      isDisabled ? 'bg-muted opacity-50' :
                      isCompleted || isCurrent ? 'bg-primary' : 'bg-muted'
                    }`} 
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${
                      isDisabled ? 'text-muted-foreground opacity-50' :
                      isCompleted || isCurrent ? 'font-medium' : 'text-muted-foreground'
                    }`}>
                      {stage.name}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Status Message */}
          {(isVetoed || isFailed) && (
            <div className="pt-4 text-sm text-muted-foreground">
              <p className="font-medium text-red-500">
                {isVetoed ? 'This bill was vetoed' : 'This bill failed to progress'}
              </p>
              <p className="mt-1">
                {bill.latestActionText}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}