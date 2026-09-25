import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// shadcn/ui's Badge on the brand tokens. A label, never a status: a stage is a
// StatusPill (components/brand/status.tsx) so it always carries its colour dot
// and word together.
const badgeVariants = cva(
  'inline-flex h-6 items-center rounded-sm px-2 font-sans text-[13px] font-medium leading-none transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        // A topic or category tag. ink-2, not muted-foreground: ink-3 on the
        // sunken fill is just under 4.5:1.
        secondary: 'bg-secondary text-ink-2',
        outline: 'border border-border bg-card text-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
      },
    },
    defaultVariants: {
      variant: 'outline',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

// A <span>, not shadcn 2's <div> (newer shadcn does the same): badges sit
// inside paragraphs and links, where a div is invalid HTML.
function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
