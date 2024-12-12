'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number | null;
  max?: number;
  className?: string;
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value = 0, max = 100, ...props }, ref) => {
    const percentage = value != null ? Math.min(Math.max(0, value), max) : 0;
    const progressWidth = `${(percentage / max) * 100}%`;

    return (
      <div
        ref={ref}
        className={cn(
          'relative h-4 w-full overflow-hidden rounded-full bg-secondary',
          className
        )}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={percentage}
        {...props}
      >
        <div
          className="h-full w-full flex-1 bg-primary transition-all duration-200"
          style={{ width: progressWidth }}
        />
      </div>
    );
  }
);

Progress.displayName = 'Progress';

export { Progress };
