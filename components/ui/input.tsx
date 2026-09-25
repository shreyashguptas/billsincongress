import * as React from 'react';

import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-line-strong bg-raised px-3 py-2 font-sans text-[15px] text-ink transition-colors touchable:h-11',
          'placeholder:text-ink-3',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink',
          'focus-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
