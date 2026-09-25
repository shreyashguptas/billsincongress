'use client';

import { useRef } from 'react';
import { analytics } from '@/lib/analytics';
import { formatCongressYearsShort, formatCongressOrdinal } from '@/lib/congress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

export interface CongressScopeProps {
  /** Congresses with data. Comes from the server; this never fetches. */
  congressNumbers: number[];
  /** Current value: a Congress number as a string, or 'all'. */
  value: string;
  onChange: (next: string) => void;
  /**
   * How many filters are set. Passed in rather than derived: this component
   * deliberately sees only the Congress value, and reporting a hardcoded zero
   * would make the metric quietly wrong rather than obviously missing.
   */
  activeFilterCount: number;
}

/**
 * Which Congress is being browsed.
 *
 * This is scope, not a filter, and it is presented as one — a segmented control
 * beside the search field rather than a chip among the constraints. The chosen
 * Congress is a raised segment, not an ink fill like a set filter, because
 * narrowing to one two-year Congress is the page's normal state rather than
 * something the reader has restricted.
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
export function CongressScope({
  congressNumbers,
  value,
  onChange,
  activeFilterCount,
}: CongressScopeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ordered = [...congressNumbers].sort((a, b) => b - a);
  const newest = ordered[0];

  if (ordered.length === 0) {
    return (
      <span className="font-mono text-xs text-ink-3" aria-disabled="true">
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
      active_filter_count: activeFilterCount,
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
    // Radix renders the radiogroup/radio roles. Its roving focus is off because
    // it moves focus without selecting; the handler above keeps the
    // radiogroup behaviour, where the arrows change the selection.
    <ToggleGroup
      ref={ref}
      type="single"
      rovingFocus={false}
      value={String(selected)}
      // Radix reports '' when the chosen segment is pressed again. Re-selecting
      // it instead keeps a segment always chosen.
      onValueChange={(next) => select(next ? Number(next) : selected)}
      aria-label="Congress"
      onKeyDown={onKeyDown}
      className="inline-flex h-[52px] shrink-0 items-stretch justify-start gap-0.5 rounded-md bg-sunken p-1"
    >
      {ordered.map((congress) => {
        const isSelected = congress === selected;
        return (
          <ToggleGroupItem
            key={congress}
            value={String(congress)}
            data-congress={congress}
            // Only the selected segment is a tab stop; arrows move within.
            tabIndex={isSelected ? 0 : -1}
            title={`${formatCongressOrdinal(congress)} Congress`}
            className={
              'h-auto min-w-min flex-1 rounded-[6px] px-3 font-mono text-[13px] font-normal tabular text-ink-2 ' +
              'hover:bg-transparent hover:text-ink ' +
              'data-[state=on]:bg-raised data-[state=on]:font-medium data-[state=on]:text-ink data-[state=on]:shadow-sm'
            }
          >
            {formatCongressYearsShort(congress)}
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
