'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

// Ink is the only action colour (Documentation/brand.md, "Actions"): a primary
// button is an ink fill, everything else is outlined, quiet, or a link. No
// variant takes a hue — on this site a hue means data.
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans text-sm font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50 select-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Once per view, for the thing the page is for.
        default: 'bg-ink text-on-ink hover:bg-ink/85 active:bg-ink/95',
        // Everything else a reader can do.
        outline: 'border border-line-strong bg-raised text-ink hover:bg-sunken',
        // Inside dense rows and headers.
        ghost: 'text-ink hover:bg-sunken',
        link: 'h-auto rounded-none p-0 text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        default: 'h-10 px-4 touchable:h-11',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'h-10 w-10',
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
