'use client';

import { Bill } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface BillTimelineProps {
  bill: Bill;
}

export function BillTimeline({ bill }: BillTimelineProps) {
  // Define the stages a bill typically goes through with cumulative progress
  const stages = [
    { name: 'Introduced', progress: 20 },
    { name: 'Reported', progress: 40 },
    { name: 'Passed House', progress: 60 },
    { name: 'Passed Senate', progress: 80 },
    { name: 'Became Law', progress: 100 },
  ];

  // Find the current stage based on bill's progress
  const currentStage = stages.find(stage => bill.progress <= stage.progress) || stages[stages.length - 1];
  const previousStage = stages[Math.max(stages.indexOf(currentStage) - 1, 0)];

  // Calculate the actual progress within the current stage
  const stageProgress = stages.indexOf(currentStage) === 0 
    ? bill.progress 
    : previousStage.progress + ((bill.progress - previousStage.progress) / (currentStage.progress - previousStage.progress)) * (currentStage.progress - previousStage.progress);

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
              <span className="text-muted-foreground">{Math.round(stageProgress)}%</span>
            </div>
            <Progress value={stageProgress} />
          </div>

          {/* Timeline */}
          <div className="space-y-4 pt-4">
            {stages.map((stage, index) => {
              const isCompleted = bill.progress >= stage.progress;
              const isCurrent = stage === currentStage;
              
              return (
                <div key={stage.name} className="flex items-center gap-4">
                  <div 
                    className={`h-2 w-2 rounded-full ${
                      isCompleted || isCurrent ? 'bg-primary' : 'bg-muted'
                    }`} 
                  />
                  <div className="flex-1">
                    <p className={`text-sm ${
                      isCompleted || isCurrent ? 'font-medium' : 'text-muted-foreground'
                    }`}>
                      {stage.name}
                    </p>
                  </div>
                  {(isCompleted || isCurrent) && (
                    <div className="text-xs text-muted-foreground">
                      {stage.progress}%
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}