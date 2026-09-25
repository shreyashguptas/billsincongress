'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@/lib/utils';

/**
 * Anchored floating surface for pointer devices.
 *
 * Modelled on `select.tsx`: bg-popover, rounded-md, border-border, z-50.
 *
 * This exists because neither of the primitives already installed can host the
 * filter pickers: `DropdownMenu` imposes `role="menu"` and its own typeahead,
 * which fights a search input; `Select` cannot render arbitrary children at
 * all. A picker needs a text field above a scrollable listbox.
 */
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'start', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={12}
      className={cn(
        // z-50 matches the other portalled Radix surfaces and clears the z-40
        // site header. The listbox this replaced was a non-portalled z-30 div,
        // so it rendered underneath the nav.
        'z-50 rounded-md border border-border bg-popover text-foreground shadow-float outline-none',
        'data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
