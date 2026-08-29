'use client';

import { useId, type ReactNode } from 'react';
import { analytics, type FilterSurface } from '@/lib/analytics';
import { formatCount } from '@/lib/utils';
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
 * Shape of it: Congress scope on its own line, one search field, then a rail of
 * pills that shows more of itself as the viewport widens, with everything else
 * behind "All filters". Each pill both sets its filter and displays it, so
 * there is no second row of chips restating what the pills already say.
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
    <section className="border-b border-border bg-secondary/30">
      <div className="container-editorial py-4 sm:py-5">
        <div role="search" aria-labelledby={headingId}>
          <h2 id={headingId} className="sr-only">
            Filter bills
          </h2>

          {/* Row 0 — scope */}
          <div className="flex items-center justify-between gap-3">
            <p className="label-eyebrow !mb-0 hidden sm:block">Filtering</p>
            <CongressScope
              congressNumbers={congressNumbers}
              value={values.congress}
              onChange={(next) => onChange({ congress: next }, 'scope')}
            />
          </div>

          {/* Row 1 — search */}
          <div className="mt-3 lg:max-w-2xl">
            <SearchField
              value={values.title}
              onCommit={(next) => onChange({ title: next }, 'rail')}
            />
          </div>

          {/* Row 2 — pill rail + all filters */}
          <div className="mt-3 flex items-center gap-2">
            <div className="-mx-4 min-w-0 flex-1 overflow-x-auto overscroll-x-contain px-4 [mask-image:linear-gradient(to_right,black_calc(100%_-_20px),transparent)] [scrollbar-width:none] lg:overflow-visible lg:[mask-image:none] [&::-webkit-scrollbar]:hidden">
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
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-mono tabular text-foreground">{formatCount(count)}</span>{' '}
              {count === 1 ? 'filter' : 'filters'} applied{' '}
              <span aria-hidden="true">·</span>{' '}
              <button
                type="button"
                onClick={() => {
                  analytics.billsFiltersCleared({
                    active_filter_count: count,
                    surface: 'bar',
                  });
                  onClearAll();
                }}
                className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
              >
                Clear all
              </button>
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
