import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-2 py-0.5 font-sans text-[11px] font-medium uppercase tracking-[0.08em] transition-colors',
  {
    variants: {
      variant: {
        default:
          'bg-foreground text-background',
        secondary:
          'bg-secondary text-secondary-foreground',
        outline:
          'border border-border text-foreground bg-transparent',
        accent:
          'bg-accent text-accent-foreground',
        muted:
          'bg-transparent text-muted-foreground border border-border/70',
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
