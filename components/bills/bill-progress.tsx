'use client';

import { Progress } from '@/components/ui/progress';
import { getStageDescription, getStagePercentage, isValidStage, BillStages } from '@/lib/utils/bill-stages';

interface BillProgressProps {
  stage: number;
  description: string;
}

export function BillProgress({ stage, description }: BillProgressProps) {
  // Get stage information using utility functions
  const displayDescription = getStageDescription(stage);
  const progressPercentage = getStagePercentage(stage);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <span className="text-sm">{displayDescription}</span>
      </div>
      <Progress value={progressPercentage} className="h-3" />
    </div>
  );
}