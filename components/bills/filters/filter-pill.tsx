'use client';

import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export interface FilterPillProps
  // `value` is redeclared as a display label, which is not what a <button>'s
  // own `value` attribute means.
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  /** The filter's short name — always shown. */
  name: string;
  /** The chosen value, shown next to the name when the filter is set. */
  value?: string | null;
  /** The long form, e.g. "Sponsor's home state: California". */
  describedAs?: string;
}

/**
 * The trigger for one filter — and simultaneously its chip and its state
 * display, which is why there is no longer a second row of removable chips
 * below the bar.
 *
 * Two changes from what this replaces:
 *
 *  - It is a real `<button>`. The old pill was a styled div with a transparent
 *    native `<select>` stretched across it, so it took no focus ring, could not
 *    be styled open, and handed a 51-row list to the operating system.
 *  - It shows the chosen VALUE, not just the filter's name plus a 6px dot. The
 *    dot meant a sighted reader had to look in a second place to find out what
 *    was applied, while a screen-reader user was told outright — an unusual way
 *    round.
 *
 * Sentence case at 14px rather than the 11px uppercase eyebrow the old pills
 * used: seven identical all-caps labels is the wall this redesign is undoing,
 * and uppercase tracking makes the same words about 1.8x wider.
 *
 * A set filter turns the chip ink (Documentation/brand.md: the chrome is ink,
 * never a hue), so what is narrowing the list reads at a glance.
 */
export const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(
  ({ name, value, describedAs, className, ...props }, ref) => {
    const active = Boolean(value);
    return (
      <Button
        ref={ref}
        type="button"
        // Set: the ink primary. Unset: outline, which is already the chip's
        // raised fill and line-strong edge.
        variant={active ? 'default' : 'outline'}
        aria-haspopup="dialog"
        aria-label={describedAs ?? name}
        className={cn(
          'h-9 shrink-0 gap-1.5 rounded-sm px-3',
          active && 'border border-ink',
          className
        )}
        {...props}
      >
        <span className={cn('shrink-0', active && 'font-normal text-on-ink/75')}>{name}</span>
        {active && <span className="max-w-[14ch] truncate">{value}</span>}
        <ChevronDown
          className={cn('h-4 w-4 shrink-0', active ? 'text-on-ink/75' : 'text-ink-3')}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </Button>
    );
  }
);
FilterPill.displayName = 'FilterPill';
