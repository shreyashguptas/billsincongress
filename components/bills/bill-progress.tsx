'use client';

import {
  BillStages,
  getStageDescription,
  getStageStep,
} from '@/lib/utils/bill-stages';
import { cn } from '@/lib/utils';

interface BillProgressProps {
  stage: number;
}

// Filled-segment color per stage — same tokens the dashboard funnel uses.
const StageSegmentColor: Record<number, string> = {
  [BillStages.INTRODUCED]: 'bg-status-introduced',
  [BillStages.IN_COMMITTEE]: 'bg-status-committee',
  [BillStages.PASSED_ONE_CHAMBER]: 'bg-status-passed-one',
  [BillStages.PASSED_BOTH_CHAMBERS]: 'bg-status-passed-both',
  [BillStages.VETOED]: 'bg-accent',
  [BillStages.TO_PRESIDENT]: 'bg-status-president',
  [BillStages.SIGNED_BY_PRESIDENT]: 'bg-status-signed',
  [BillStages.BECAME_LAW]: 'bg-status-law',
};

export function BillProgress({ stage }: BillProgressProps) {
  const description = getStageDescription(stage);
  const { step, total, isVetoed } = getStageStep(stage);
  const filledColor = StageSegmentColor[stage] ?? 'bg-status-introduced';

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-eyebrow">Status</span>
        {!isVetoed && (
          <span className="font-mono text-[11px] text-muted-foreground tabular">
            Stage {step} of {total}
          </span>
        )}
      </div>
      <p
        className={cn(
          'text-sm font-medium leading-tight',
          isVetoed ? 'text-accent' : 'text-foreground'
        )}
      >
        {description}
      </p>
      <div
        className="flex gap-1 pt-0.5"
        role="img"
        aria-label={
          isVetoed
            ? 'Vetoed — did not become law'
            : `Stage ${step} of ${total} in the legislative process`
        }
      >
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-[3px] flex-1 rounded-full',
              i < step ? filledColor : 'bg-secondary'
            )}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
