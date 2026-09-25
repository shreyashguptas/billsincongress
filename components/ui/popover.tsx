'use client';

import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

import { cn } from '@/lib/utils';

/**
 * Anchored floating surface for pointer devices.
 *
 * Deliberately modelled on `select.tsx` (bg-raised, rounded-md, border-line,
 * z-50) rather than on `dropdown-menu.tsx`, which uses bg-paper and
 * rounded-md and is the inconsistent one of the two.
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
        'z-50 rounded-md border border-line bg-raised text-ink shadow-float outline-none',
        'data-[state=open]:animate-popover-in data-[state=closed]:animate-popover-out',
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverAnchor, PopoverContent };
