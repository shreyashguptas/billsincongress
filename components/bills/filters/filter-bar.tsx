'use client';

import { useId, type ReactNode } from 'react';
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
  /**
   * The browse-by-category disclosure. Passed in as already-rendered JSX from a
   * server component rather than imported, so its 40 hub anchors stay in the
   * server-rendered HTML instead of becoming client-only markup.
   */
  browseDirectory?: ReactNode;
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
  browseDirectory,
}: FilterBarProps) {
  const headingId = useId();
  const count = activeFilterCount(values);

  const railFilters = FILTERS.filter((f) => f.tier === 'base' || f.tier === 'sm' || f.tier === 'lg');

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
            <div className="-mx-4 min-w-0 flex-1 overflow-x-auto overscroll-x-contain px-4 py-1 [mask-image:linear-gradient(to_right,black_calc(100%_-_20px),transparent)] [scrollbar-width:none] lg:overflow-visible lg:[mask-image:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2">
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
            <p className="mt-2 text-[13px] text-ink-2">
              <span className="font-mono tabular text-ink">{formatCount(count)}</span>{' '}
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
                className="rounded-xs text-[13px] decoration-1"
              >
                Clear all
              </Button>
            </p>
          )}
        </div>
      </div>

      {/* Outside role="search": these are navigation, not controls, and a
          search landmark is the wrong place to put forty links. */}
      {browseDirectory && <div className="container-editorial">{browseDirectory}</div>}
    </section>
  );
}
