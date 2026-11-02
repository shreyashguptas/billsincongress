'use client';

import { useEffect, useRef, useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
      // The button sits at the right end of the bar: opening leftward keeps the
      // popover over the results, not over the docked Ask panel beside them or
      // past the edge of the column on a wide screen.
      align="end"
      popoverClassName="w-[min(32rem,calc(100vw_-_2rem))] max-h-[min(32rem,var(--radix-popover-content-available-height))]"
      trigger={
        <Button
          type="button"
          // A ghost button: the chips beside it are the controls, this is the
          // way to the rest of them.
          variant="ghost"
          aria-haspopup="dialog"
          aria-label="All filters"
          className="h-9 shrink-0 px-3"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="hidden sm:inline">All filters</span>
          {/* A span, not Badge: Badge renders a <div>, which a button cannot hold. */}
          {count > 0 && (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-ink px-1 font-mono text-xs tabular text-on-ink">
              {count}
            </span>
          )}
        </Button>
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

  /*
   * Moving between the list and a drill-down: a short slide in from the side
   * the reader is heading (right going in, left coming back) and focus to where
   * they would expect it, the sub-list going in and the row they came from
   * coming back. Without the focus move, the button that was pressed is
   * unmounted under the focus and a keyboard reader lands on the sheet itself.
   */
  const [direction, setDirection] = useState<'in' | 'back' | null>(null);
  const cameFrom = useRef<string | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const openDrilldown = (definition: FilterDefinition) => {
    cameFrom.current = definition.field;
    setDirection('in');
    setDrilldown(definition);
  };
  const backToList = () => {
    setDirection('back');
    setDrilldown(null);
  };
  useEffect(() => {
    if (direction === null) return;
    const root = screenRef.current;
    if (!root) return;
    const target =
      direction === 'in'
        ? root.querySelector<HTMLElement>('[data-autofocus]')
        : root.querySelector<HTMLElement>(`[data-filter-row="${cameFrom.current}"]`);
    target?.focus({ preventScroll: direction === 'in' });
  }, [drilldown, direction]);

  const screenClass = cn(
    'flex min-h-0 flex-1 flex-col',
    direction &&
      'duration-150 animate-in fade-in-0 motion-reduce:animate-none',
    direction === 'in' && 'slide-in-from-right-2',
    direction === 'back' && 'slide-in-from-left-2'
  );

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
      <div key="drilldown" ref={screenRef} className={screenClass}>
        <div
          className={cn(
            'flex shrink-0 items-center gap-1 border-b border-line px-2 pb-2',
            layout === 'touch' ? 'pt-0' : 'pt-2'
          )}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={backToList}
            className="h-9 gap-1 px-2 text-ink-2 hover:text-ink touchable:h-11"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            All filters
          </Button>
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
          close={backToList}
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
      </div>
    );
  }

  const listed = FILTERS.filter(
    (f) => f.tier !== 'scope' && f.field !== 'title' && f.field !== 'billNumber'
  );

  // See the note in option-list.tsx: the bottom sheet is a dialog and has to be
  // named, so its visible heading doubles as the dialog title.
  const Heading = layout === 'touch' ? SheetTitle : 'p';

  return (
    <div key="list" ref={screenRef} className={screenClass}>
      {/* The bottom sheet draws its grab bar above this (SheetContent `grabber`). */}
      <div
        className={cn(
          'flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 pb-3',
          layout === 'touch' ? 'pt-1' : 'pt-3'
        )}
      >
        <Heading className="font-serif text-[19px] font-medium leading-snug text-ink">
          All filters
        </Heading>
        {layout === 'touch' && (
          <SheetDescription className="sr-only">
            Every filter available on this page, including the ones the bar has no
            room for.
          </SheetDescription>
        )}
        {activeFilterCount(values) > 0 && (
          <Button
            type="button"
            variant="link"
            onClick={() => {
              analytics.billsFiltersCleared({
                active_filter_count: activeFilterCount(values),
                surface: 'panel',
              });
              onClearAll();
            }}
            className="touch-hit rounded-xs text-[13px] decoration-1"
          >
            Clear all
          </Button>
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
              <div key={definition.field} className="border-b border-line last:border-b-0">
                <p className="label-eyebrow !mb-0 px-4 pb-1.5 pt-3">{definition.label}</p>
                <ToggleGroup
                  type="single"
                  // Every chip stays a tab stop, as before; Radix's roving focus
                  // would collapse each row to one.
                  rovingFocus={false}
                  value={value as string}
                  // Radix reports '' when the chosen chip is pressed again; that
                  // re-applies it rather than leaving the filter with no value.
                  onValueChange={(next) =>
                    onChange(
                      { [definition.field]: next || (value as string) } as Partial<BillsFilterValues>,
                      'panel'
                    )
                  }
                  aria-label={definition.label}
                  className="flex-wrap justify-start gap-1.5 px-4 pb-3"
                >
                  {options.map((option) => (
                    <ToggleGroupItem
                      key={option.value}
                      value={option.value}
                      className={
                        'h-9 min-w-0 rounded-sm border border-line-strong bg-raised text-ink hover:bg-sunken hover:text-ink touchable:h-11 ' +
                        'data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-on-ink'
                      }
                    >
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
            );
          }

          return (
            <Button
              key={definition.field}
              type="button"
              variant="ghost"
              onClick={() => openDrilldown(definition)}
              data-filter-row={definition.field}
              // A full-width row: square, with the focus ring drawn inside it.
              className="flex h-12 w-full justify-between gap-3 rounded-none border-b border-line px-4 text-left font-normal last:border-b-0 focus-visible:ring-inset focus-visible:ring-offset-0 touchable:h-14"
            >
              <span className="shrink-0 font-medium text-ink">{definition.label}</span>
              <span className="flex min-w-0 items-center gap-1">
                <span
                  className={cn(
                    'truncate',
                    set ? 'font-medium text-ink' : 'text-ink-3'
                  )}
                >
                  {set ? definition.describe(value) : definition.emptyLabel}
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-ink-3"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
            </Button>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-line px-4 py-3">
        <Button type="button" onClick={close} className="w-full">
          Show bills
        </Button>
      </div>
    </div>
  );
}
