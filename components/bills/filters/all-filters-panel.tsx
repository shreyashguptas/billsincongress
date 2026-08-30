'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import { analytics, type FilterSurface } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { SponsorOption } from '@/lib/services/bills-service';
import type { BillsFilterValues } from '@/app/bills/filter-signature';
import {
  FILTERS,
  activeFilterCount,
  isSet,
  type FilterDefinition,
} from '@/lib/bills/filter-registry';
import { SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { AdaptiveSurface } from './adaptive-surface';
import { OptionList } from './option-list';
import { loadSponsors } from './sponsor-source';

/** Lists too long to inline into the panel get their own drill-down screen. */
const DRILLDOWN_THRESHOLD = 8;

export interface AllFiltersPanelProps {
  values: BillsFilterValues;
  congressNumbers: number[];
  onChange: (patch: Partial<BillsFilterValues>, surface: FilterSurface) => void;
  onClearAll: () => void;
}

/**
 * Every filter in one place — including the ones the pill rail does not have
 * room for at this width.
 *
 * The interaction is the iOS Settings pattern: one overlay, two screens. Short
 * lists render inline as tappable rows; a long list replaces the panel body
 * under a "Back" header rather than opening a second overlay on top of the
 * first, which on a phone leaves the reader with two things to dismiss and no
 * idea which one Escape will close.
 *
 * There is no Apply button. Filters apply as they change, exactly as they do in
 * the bar; the closing button only closes. An Apply button was removed from
 * this page once already, and reintroducing one would resurrect a staging model
 * the rest of the page does not have.
 */
export function AllFiltersPanel({
  values,
  congressNumbers,
  onChange,
  onClearAll,
}: AllFiltersPanelProps) {
  const count = activeFilterCount(values);

  return (
    <AdaptiveSurface
      popoverClassName="w-[min(32rem,calc(100vw_-_2rem))] max-h-[min(32rem,var(--radix-popover-content-available-height))]"
      trigger={
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label="All filters"
          className={cn(
            'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-sm border px-3 text-[13px] transition-colors touchable:h-11',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            count > 0
              ? 'border-foreground/40 bg-secondary text-foreground'
              : 'border-control bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
          )}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="hidden sm:inline">All filters</span>
          {count > 0 && (
            // The single use of the accent colour in the whole band. Marking
            // every active pill in red would put six red marks on a page whose
            // language rations accent to about five uses sitewide.
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] tabular text-accent-foreground">
              {count}
            </span>
          )}
        </button>
      }
      onOpenChange={(open, layout) => {
        const props = {
          filter_kind: 'all',
          layout: (layout === 'pointer' ? 'popover' : 'sheet') as 'popover' | 'sheet',
          active_filter_count: count,
        };
        if (open) analytics.billsFilterPanelOpened(props);
      }}
    >
      {({ layout, close }) => (
        <PanelBody
          values={values}
          congressNumbers={congressNumbers}
          onChange={onChange}
          onClearAll={onClearAll}
          layout={layout}
          close={close}
        />
      )}
    </AdaptiveSurface>
  );
}

function PanelBody({
  values,
  congressNumbers,
  onChange,
  onClearAll,
  layout,
  close,
}: AllFiltersPanelProps & { layout: 'pointer' | 'touch'; close: () => void }) {
  const [drilldown, setDrilldown] = useState<FilterDefinition | null>(null);
  const [sponsors, setSponsors] = useState<SponsorOption[]>([]);
  const [sponsorState, setSponsorState] = useState<'idle' | 'loading' | 'error' | 'ready'>(
    'idle'
  );
  const [attempt, setAttempt] = useState(0);

  const needsSponsors = drilldown?.field === 'sponsor';
  useEffect(() => {
    if (!needsSponsors) return;
    if (sponsorState === 'ready' || sponsorState === 'loading') return;
    let cancelled = false;
    setSponsorState('loading');
    loadSponsors()
      .then((rows) => {
        if (cancelled) return;
        setSponsors(rows);
        setSponsorState('ready');
      })
      .catch(() => {
        if (!cancelled) setSponsorState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSponsors, attempt]);

  const optionsFor = (definition: FilterDefinition) =>
    definition.options({
      congressNumbers,
      sponsors,
      currentValue: Array.isArray(values[definition.field])
        ? ''
        : (values[definition.field] as string),
      chamber: values.chamber,
    });

  if (drilldown) {
    return (
      <>
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
          <button
            type="button"
            onClick={() => setDrilldown(null)}
            className="inline-flex h-9 items-center gap-1 rounded-sm px-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touchable:h-11"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            All filters
          </button>
        </div>
        <OptionList
          kind={drilldown.kind}
          title={drilldown.label}
          helper={drilldown.helper}
          options={optionsFor(drilldown)}
          value={values[drilldown.field]}
          multi={drilldown.multi}
          layout={layout}
          // Selecting inside a drill-down returns to the panel rather than
          // dismissing the whole overlay — the reader came here to set several.
          close={() => setDrilldown(null)}
          loading={needsSponsors && sponsorState === 'loading'}
          error={
            needsSponsors && sponsorState === 'error'
              ? "Couldn't load the list of sponsors."
              : null
          }
          onRetry={needsSponsors ? () => setAttempt((n) => n + 1) : undefined}
          onChange={(next) =>
            onChange({ [drilldown.field]: next } as Partial<BillsFilterValues>, 'panel')
          }
        />
      </>
    );
  }

  const listed = FILTERS.filter(
    (f) => f.tier !== 'scope' && f.field !== 'title' && f.field !== 'billNumber'
  );

  // See the note in option-list.tsx: the bottom sheet is a dialog and has to be
  // named, so its visible heading doubles as the dialog title.
  const Heading = layout === 'touch' ? SheetTitle : 'p';

  return (
    <>
      {layout === 'touch' && (
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-border" aria-hidden="true" />
      )}

      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 pb-3 pt-3">
        <Heading className="font-serif text-base font-semibold tracking-tight text-foreground">
          All filters
        </Heading>
        {layout === 'touch' && (
          <SheetDescription className="sr-only">
            Every filter available on this page, including the ones the bar has no
            room for.
          </SheetDescription>
        )}
        {activeFilterCount(values) > 0 && (
          <button
            type="button"
            onClick={() => {
              analytics.billsFiltersCleared({
                active_filter_count: activeFilterCount(values),
                surface: 'panel',
              });
              onClearAll();
            }}
            className="text-xs font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {listed.map((definition) => {
          const value = values[definition.field];
          const set = isSet(value);
          const options = optionsFor(definition);
          const inline =
            !definition.multi && options.length > 0 && options.length <= DRILLDOWN_THRESHOLD;

          if (inline) {
            return (
              <div key={definition.field} className="border-b border-border last:border-b-0">
                <p className="label-eyebrow !mb-0 px-4 pb-1.5 pt-3">{definition.label}</p>
                <div className="flex flex-wrap gap-1.5 px-4 pb-3">
                  {options.map((option) => {
                    const selected = (value as string) === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() =>
                          onChange(
                            { [definition.field]: option.value } as Partial<BillsFilterValues>,
                            'panel'
                          )
                        }
                        className={cn(
                          'inline-flex h-9 items-center rounded-sm border px-2.5 text-[13px] transition-colors touchable:h-11',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          selected
                            ? 'border-foreground/40 bg-secondary font-medium text-foreground'
                            : 'border-control bg-card text-muted-foreground hover:border-foreground/40 hover:text-foreground'
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <button
              key={definition.field}
              type="button"
              onClick={() => setDrilldown(definition)}
              className="flex h-12 w-full items-center justify-between gap-3 border-b border-border px-4 text-left text-sm transition-colors last:border-b-0 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring touchable:h-14"
            >
              <span className="shrink-0 text-foreground">{definition.label}</span>
              <span className="flex min-w-0 items-center gap-1">
                <span
                  className={cn(
                    'truncate',
                    set ? 'font-medium text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {set ? definition.describe(value) : definition.emptyLabel}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <button
          type="button"
          onClick={close}
          className="h-10 w-full rounded-sm border border-control bg-card text-sm font-medium text-foreground transition-colors hover:border-foreground/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touchable:h-12"
        >
          Show bills
        </button>
      </div>
    </>
  );
}
