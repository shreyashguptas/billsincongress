'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { analytics, type FilterSurface } from '@/lib/analytics';
import { formatCount } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { BillsFilterValues } from '@/app/bills/filter-signature';
import { FILTERS, activeFilterCount, isSet } from '@/lib/bills/filter-registry';
import { AllFiltersPanel } from './all-filters-panel';
import { CongressScope } from './congress-scope';
import { FilterField } from './filter-field';
import { SearchField } from './search-field';

export interface FilterBarProps {
  values: BillsFilterValues;
  onChange: (patch: Partial<BillsFilterValues>, surface: FilterSurface) => void;
  onClearAll: () => void;
  /** Congresses with data, from the server. */
  congressNumbers: number[];
}

/**
 * The filter band under the /bills masthead.
 *
 * Shape of it: one large search field with the Congress scope beside it, then
 * a rail of chips that shows more of itself as the viewport widens, with
 * everything else behind "All filters". Each chip both sets its filter and
 * displays it, so there is no second row of chips restating what the chips
 * already say.
 *
 * Which pills are inline is a CSS width question and is answered in the
 * server-rendered HTML with no JavaScript. Which SHELL a picker opens in is a
 * pointer-device question and is answered separately — see `AdaptiveSurface`.
 * They are different questions and conflating them is what gives a touchscreen
 * laptop a popover it has to poke at.
 *
 * A pill whose filter is currently set is always shown, whatever its tier: a
 * filter that is narrowing the results must never be invisible because the
 * window is narrow.
 */
export function FilterBar({
  values,
  onChange,
  onClearAll,
  congressNumbers,
}: FilterBarProps) {
  const headingId = useId();
  const count = activeFilterCount(values);

  const railFilters = FILTERS.filter((f) => f.tier === 'base' || f.tier === 'sm' || f.tier === 'lg');
  const rail = useRef<HTMLDivElement>(null);
  const overflows = useOverflows(rail);

  return (
    <section>
      <div className="container-editorial pb-2">
        <div role="search" aria-labelledby={headingId}>
          <h2 id={headingId} className="sr-only">
            Filter bills
          </h2>

          {/* Row 1 — search, with the Congress scope beside it (below it on
              phones, where three segments need the full width). */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <SearchField
                value={values.title}
                onCommit={(next) => onChange({ title: next }, 'rail')}
              />
            </div>
            <CongressScope
              congressNumbers={congressNumbers}
              value={values.congress}
              onChange={(next) => onChange({ congress: next }, 'scope')}
              activeFilterCount={count}
            />
          </div>

          {/* Row 2 — chip rail + all filters */}
          <div className="mt-3 flex items-center gap-2">
            {/* Bleeds to the screen's left edge, and on the right only 4px into
                the gap: further, it would run under All filters and take the
                start of its target. No right padding and a 6px gap, so Topic,
                Outcome and Chamber fit whole at 390px; the fade at the end is
                drawn only when the chips really run past it. */}
            <div
              ref={rail}
              data-overflow={overflows ? 'true' : undefined}
              className="-ml-4 -mr-1 min-w-0 flex-1 overflow-x-auto overscroll-x-contain py-1 pl-4 pr-0 scrollbar-none data-[overflow=true]:mask-[linear-gradient(to_right,black_calc(100%-20px),transparent)] lg:overflow-visible lg:data-[overflow=true]:mask-none [&::-webkit-scrollbar]:hidden"
            >
              <div className="flex w-max gap-1.5">
                {railFilters.map((definition) => {
                  const set = isSet(values[definition.field]);
                  // Tier decides visibility, but a set filter is never hidden.
                  const tierClass = set
                    ? 'flex'
                    : definition.tier === 'base'
                      ? 'flex'
                      : definition.tier === 'sm'
                        ? 'hidden sm:flex'
                        : 'hidden lg:flex';
                  return (
                    <FilterField
                      key={definition.field}
                      definition={definition}
                      values={values}
                      congressNumbers={congressNumbers}
                      onChange={onChange}
                      surface="rail"
                      className={tierClass}
                    />
                  );
                })}
              </div>
            </div>

            <AllFiltersPanel
              values={values}
              congressNumbers={congressNumbers}
              onChange={onChange}
              onClearAll={onClearAll}
            />
          </div>

          {/* Row 2b — how much is applied, always visible even when the rail
              has scrolled the evidence out of sight. */}
          {count > 0 && (
            <p className="mt-2 text-caption text-ink-2">
              <span className="font-medium tabular text-ink">{formatCount(count)}</span>{' '}
              {count === 1 ? 'filter' : 'filters'} applied{' '}
              <span aria-hidden="true">·</span>{' '}
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  analytics.billsFiltersCleared({
                    active_filter_count: count,
                    surface: 'bar',
                  });
                  onClearAll();
                }}
                className="touch-hit rounded-xs text-caption decoration-1"
              >
                Clear all
              </Button>
            </p>
          )}
        </div>
      </div>

    </section>
  );
}

/** Whether a scrolling row's content runs past its edge, kept up to date. */
function useOverflows(ref: RefObject<HTMLDivElement | null>): boolean {
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [ref]);
  return overflows;
}
