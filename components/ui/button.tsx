'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// shadcn/ui's Button on the brand tokens. Ink is the only action colour
// (Documentation/brand.md, "Components"): `default` is the ink primary, once per
// view; everything else is outline, secondary, ghost or link. `destructive` is
// the one hue, kept for irreversible deletes.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Once per view, for the thing the page is for.
        default: 'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/95',
        // Everything else a reader can do.
        outline: 'border border-input bg-card text-foreground hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        // Inside dense rows and headers.
        ghost: 'text-foreground hover:bg-accent',
        link: 'h-auto rounded-none p-0 text-foreground underline decoration-input underline-offset-[3px] hover:decoration-foreground',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        default: 'h-10 px-4 touchable:h-11',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'h-10 w-10 touchable:h-11 touchable:w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
