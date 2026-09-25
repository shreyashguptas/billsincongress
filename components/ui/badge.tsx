import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// A label, never a status: a stage is a StatusPill (components/bills/status-pill.tsx)
// so it always carries its colour dot and word together.
const badgeVariants = cva(
  'inline-flex h-6 items-center rounded-sm px-2 font-sans text-[13px] font-medium leading-none transition-colors',
  {
    variants: {
      variant: {
        // A topic or category tag.
        muted: 'bg-sunken text-ink-2',
        outline: 'border border-line bg-raised text-ink',
        solid: 'bg-ink text-on-ink',
      },
    },
    defaultVariants: {
      variant: 'outline',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
