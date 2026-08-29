'use client';

import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
 * Sentence case at 13px rather than the 11px uppercase eyebrow the old pills
 * used: seven identical all-caps labels is the wall this redesign is undoing,
 * and uppercase tracking makes the same words about 1.8x wider.
 */
export const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(
  ({ name, value, describedAs, className, ...props }, ref) => {
    const active = Boolean(value);
    return (
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-label={describedAs ?? name}
        className={cn(
          'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-[13px] transition-colors touchable:h-11',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          active
            ? 'border-foreground/40 bg-secondary text-foreground'
            : 'border-control bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground',
          className
        )}
        {...props}
      >
        <span className="shrink-0">{name}</span>
        {active && (
          <span className="max-w-[14ch] truncate font-medium text-foreground">{value}</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    );
  }
);
FilterPill.displayName = 'FilterPill';
