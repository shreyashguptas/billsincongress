'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { analytics, type FilterSurface } from '@/lib/analytics';
import { hubByPath } from '@/lib/hubs';
import type { SponsorOption } from '@/lib/services/bills-service';
import type { BillsFilterValues } from '@/app/bills/filter-signature';
import type { FilterDefinition } from '@/lib/bills/filter-registry';
import { AdaptiveSurface } from './adaptive-surface';
import { FilterPill } from './filter-pill';
import { OptionList } from './option-list';
import { loadSponsors } from './sponsor-source';

export interface FilterFieldProps {
  definition: FilterDefinition;
  values: BillsFilterValues;
  congressNumbers: number[];
  onChange: (patch: Partial<BillsFilterValues>, surface: FilterSurface) => void;
  surface: FilterSurface;
  className?: string;
}

/**
 * One registry entry, rendered as a pill that opens a picker.
 *
 * The sponsor list is the only one that has to be fetched, so it is loaded on
 * first open rather than on page load, and a failure is reported as a failure —
 * previously `fetchAllSponsors` swallowed errors and returned `[]`, which the
 * UI showed as "No sponsors match" forever.
 */
export function FilterField({
  definition,
  values,
  congressNumbers,
  onChange,
  surface,
  className,
}: FilterFieldProps) {
  const value = values[definition.field];
  const isSponsor = definition.field === 'sponsor';

  const [sponsors, setSponsors] = useState<SponsorOption[]>([]);
  const [sponsorState, setSponsorState] = useState<'idle' | 'loading' | 'error' | 'ready'>(
    'idle'
  );
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!isSponsor || !opened) return;
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
  }, [isSponsor, opened, attempt]);

  const options = definition.options({
    congressNumbers,
    sponsors,
    currentValue: Array.isArray(value) ? '' : value,
    chamber: values.chamber,
  });

  const label = definition.describe(value);
  const active =
    Array.isArray(value) ? value.length > 0 : value !== 'all' && value !== '';

  // Panel dwell time and whether it changed anything — the pair that says
  // whether hiding a filter behind a tap cost the reader anything.
  const openedAt = useRef(0);
  const changes = useRef(0);

  const hub = definition.hubPath && !Array.isArray(value) ? definition.hubPath(value) : null;
  const hubDefinition = hub ? hubByPath(hub) : null;

  return (
    <AdaptiveSurface
      trigger={
        <FilterPill
          name={definition.label}
          value={active ? label : null}
          describedAs={active ? `${definition.label}: ${label}` : definition.label}
          className={className}
        />
      }
      onOpenChange={(open, layout) => {
        if (open) {
          setOpened(true);
          openedAt.current = Date.now();
          changes.current = 0;
          analytics.billsFilterPanelOpened({
            filter_kind: definition.kind,
            layout: layout === 'pointer' ? 'popover' : 'sheet',
            active_filter_count: countActive(values),
          });
        } else {
          analytics.billsFilterPanelClosed({
            filter_kind: definition.kind,
            layout: layout === 'pointer' ? 'popover' : 'sheet',
            changes_made: changes.current,
            dwell_ms: openedAt.current ? Date.now() - openedAt.current : 0,
            active_filter_count: countActive(values),
          });
        }
      }}
    >
      {({ layout, close }) => (
        <OptionList
          kind={definition.kind}
          title={definition.label}
          helper={definition.helper}
          options={options}
          value={value}
          multi={definition.multi}
          layout={layout}
          close={close}
          loading={isSponsor && sponsorState === 'loading'}
          error={
            isSponsor && sponsorState === 'error'
              ? "Couldn't load the list of sponsors."
              : null
          }
          onRetry={isSponsor ? () => setAttempt((n) => n + 1) : undefined}
          onChange={(next) => {
            changes.current += 1;
            onChange({ [definition.field]: next } as Partial<BillsFilterValues>, surface);
          }}
          footer={
            hubDefinition ? (
              <div className="shrink-0 border-t border-border px-4 py-3">
                <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                  {hubDefinition.explainer}
                </p>
                <Link
                  href={hubDefinition.path}
                  onClick={() =>
                    analytics.hubLinkClicked({
                      from_path: '/bills',
                      to_path: hubDefinition.path,
                      hub_kind: hubDefinition.kind,
                      placement: 'filter_panel',
                    })
                  }
                  className="mt-2 inline-block text-sm text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
                >
                  Read the {hubDefinition.heading.toLowerCase()} guide →
                </Link>
              </div>
            ) : null
          }
        />
      )}
    </AdaptiveSurface>
  );
}

/** Local count so this file does not import the whole registry helper set. */
function countActive(values: BillsFilterValues): number {
  let n = 0;
  for (const v of Object.values(values)) {
    if (Array.isArray(v) ? v.length > 0 : v !== '' && v !== 'all') n += 1;
  }
  return n;
}
