'use client';

import { useRef } from 'react';
import { analytics } from '@/lib/analytics';
import { formatCongressYearsShort, formatCongressOrdinal } from '@/lib/congress';
import { cn } from '@/lib/utils';

export interface CongressScopeProps {
  /** Congresses with data. Comes from the server; this never fetches. */
  congressNumbers: number[];
  /** Current value: a Congress number as a string, or 'all'. */
  value: string;
  onChange: (next: string) => void;
}

/**
 * Which Congress is being browsed.
 *
 * This is scope, not a filter, and it is presented as one — a segmented control
 * on its own line rather than a pill among the constraints, and with no accent
 * marking, because narrowing to one two-year Congress is the page's normal
 * state rather than something the reader has restricted.
 *
 * Two things it deliberately does NOT do:
 *
 *  - There is no "All Congresses" option, because there is no such view: the
 *    backend resolves an absent congress to the LATEST one, so the label would
 *    have been a lie. Congress is also the partition key of every precomputed
 *    count table.
 *  - Choosing the newest Congress writes `'all'` rather than its number, so it
 *    emits no URL parameter. A link shared today therefore still means "the
 *    current Congress" in 2027 instead of silently freezing to the 119th, and
 *    /bills stays the canonical URL.
 *
 * It also no longer fetches its own options. It used to, and on
 * `/bills?congress=118` the only option available until that fetch returned was
 * "All Congresses" — so opening the control wiped the filter, permanently if
 * Convex was unreachable.
 */
export function CongressScope({ congressNumbers, value, onChange }: CongressScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ordered = [...congressNumbers].sort((a, b) => b - a);
  const newest = ordered[0];

  if (ordered.length === 0) {
    return (
      <span className="text-xs text-muted-foreground" aria-disabled="true">
        Congress unavailable
      </span>
    );
  }

  const selected = value === 'all' ? newest : Number.parseInt(value, 10);

  const select = (congress: number) => {
    const next = congress === newest ? 'all' : String(congress);
    onChange(next);
    analytics.billsCongressScopeChanged({
      congress: String(congress),
      active_filter_count: 0,
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    const i = ordered.indexOf(selected);
    const next = ordered[Math.min(ordered.length - 1, Math.max(0, i + delta))];
    if (next !== undefined) {
      select(next);
      // Move focus with the selection, as a radiogroup should.
      ref.current
        ?.querySelector<HTMLElement>(`[data-congress="${next}"]`)
        ?.focus();
    }
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label="Congress"
      onKeyDown={onKeyDown}
      className="inline-flex h-10 items-center rounded-sm border border-control bg-card p-0.5 touchable:h-11"
    >
      {ordered.map((congress) => {
        const isSelected = congress === selected;
        return (
          <button
            key={congress}
            type="button"
            role="radio"
            data-congress={congress}
            aria-checked={isSelected}
            // Only the selected segment is a tab stop; arrows move within.
            tabIndex={isSelected ? 0 : -1}
            onClick={() => select(congress)}
            title={`${formatCongressOrdinal(congress)} Congress`}
            className={cn(
              'h-9 rounded-sm px-2.5 font-mono text-[11px] tabular transition-colors touchable:h-10',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isSelected
                ? 'bg-secondary font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {formatCongressYearsShort(congress)}
          </button>
        );
      })}
    </div>
  );
}
