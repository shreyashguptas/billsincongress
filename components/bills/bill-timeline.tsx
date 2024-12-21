'use client';

import type { BillInfo } from '@/lib/types/BillInfo';
import { useBillsStore } from '@/lib/store/bills-store';

interface BillTimelineProps {
  bill: BillInfo;
}

export function BillTimeline({ bill }: BillTimelineProps) {
  const { getProgressLabel } = useBillsStore();
  const progressStage = bill.progress_stage || 0;
  const progressLabel = getProgressLabel(progressStage);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Current Status</p>
          <p className="text-sm text-muted-foreground">{progressLabel}</p>
        </div>
        <div>
          <p className="text-sm font-medium">Latest Action</p>
          <p className="text-sm text-muted-foreground">
            {bill.latest_action_text || 'No actions recorded'}
          </p>
        </div>
      </div>
    </div>
  );
}