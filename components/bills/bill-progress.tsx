'use client';

import { Progress } from '@/components/ui/progress';

interface BillProgressProps {
  stage: number;
  description: string;
}

export function BillProgress({ stage, description }: BillProgressProps) {
  // Convert stage (20-100) to percentage (0-100)
  // Handle special case for stage 95 (Signed by President)
  const normalizedProgress = stage === 95 
    ? 93.75  // Special percentage for "Signed by President"
    : ((stage - 20) / 80) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <span className="text-sm">{description}</span>
      </div>
      <Progress value={normalizedProgress} className="h-3" />
    </div>
  );
}