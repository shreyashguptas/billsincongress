'use client';

import { getStageDescription, getStagePercentage } from '@/lib/utils/bill-stages';

interface BillProgressProps {
  stage: number;
  description: string;
}

export function BillProgress({ stage }: BillProgressProps) {
  const displayDescription = getStageDescription(stage);
  const progressPercentage = getStagePercentage(stage);

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-eyebrow">Status</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular">
          {progressPercentage}%
        </span>
      </div>
      <p className="text-[13px] font-medium text-foreground leading-tight">
        {displayDescription}
      </p>
      <div className="h-[3px] w-full bg-secondary overflow-hidden">
        <div
          className="h-full bg-foreground transition-transform duration-500 ease-out"
          style={{
            transform: `scaleX(${progressPercentage / 100})`,
            transformOrigin: 'left',
          }}
        />
      </div>
    </div>
  );
}
