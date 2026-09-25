'use client';

/**
 * Where bills come from: a tile-grid map of the U.S., one square per state,
 * shaded by how many bills its members sponsored this Congress.
 *
 * Raw counts mostly measure how big a delegation is — California has 54
 * members, Wyoming three — so there is a "per member" view that divides by
 * the state's seats. Seats come from the 2020 apportionment, which applies
 * from the 118th Congress on; for earlier Congresses that view is not offered
 * rather than computed against the wrong seat counts.
 *
 * Shading is the one `heat` amber in five equal-count steps (quintiles), with
 * a legend, so it is never mistaken for a party or for "became law".
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { analytics } from '@/lib/analytics';
import { formatCongressOrdinal } from '@/lib/congress';
import { SectionHeader } from '@/components/brand/section';
import { SectionAsk, fmt, type HomeProps } from './shared';

// [column, row] on an 11 × 8 grid.
const TILES: Record<string, [number, number]> = {
  AK: [0, 0], ME: [10, 0],
  WI: [5, 1], VT: [9, 1], NH: [10, 1],
  WA: [0, 2], ID: [1, 2], MT: [2, 2], ND: [3, 2], MN: [4, 2], IL: [5, 2], MI: [6, 2], NY: [8, 2], MA: [9, 2],
  OR: [0, 3], NV: [1, 3], WY: [2, 3], SD: [3, 3], IA: [4, 3], IN: [5, 3], OH: [6, 3], PA: [7, 3], NJ: [8, 3], CT: [9, 3], RI: [10, 3],
  CA: [0, 4], UT: [1, 4], CO: [2, 4], NE: [3, 4], MO: [4, 4], KY: [5, 4], WV: [6, 4], VA: [7, 4], MD: [8, 4], DE: [9, 4],
  AZ: [1, 5], NM: [2, 5], KS: [3, 5], AR: [4, 5], TN: [5, 5], NC: [6, 5], SC: [7, 5], DC: [8, 5],
  OK: [3, 6], LA: [4, 6], MS: [5, 6], AL: [6, 6], GA: [7, 6],
  HI: [0, 7], TX: [3, 7], FL: [8, 7],
};
const TERRITORIES = ['PR', 'GU', 'VI', 'AS', 'MP'];

const NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands',
};

/** House seats under the 2020 apportionment (118th Congress onward). Sums to 435. */
const HOUSE_SEATS_2020: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14, HI: 2, ID: 2, IL: 17, IN: 9, IA: 4,
  KS: 4, KY: 6, LA: 6, ME: 2, MD: 8, MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12,
  NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7, SD: 1, TN: 9, TX: 38, UT: 4, VT: 1,
  VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
};
const FIRST_CONGRESS_ON_2020_APPORTIONMENT = 118;

/** Voting seats plus senators; DC and the territories each have one delegate. */
function seatsFor(code: string) {
  if (code in HOUSE_SEATS_2020) return HOUSE_SEATS_2020[code] + 2;
  if (code === 'DC' || TERRITORIES.includes(code)) return 1;
  return 0;
}

type Metric = 'total' | 'perMember';

export function StateMap({
  congress,
  house,
  senate,
  onDrillDown,
}: Pick<HomeProps, 'congress' | 'house' | 'senate' | 'onDrillDown'>) {
  const perMemberAvailable = congress >= FIRST_CONGRESS_ON_2020_APPORTIONMENT;
  const [metricPick, setMetric] = useState<Metric>('total');
  const metric: Metric = perMemberAvailable ? metricPick : 'total';
  const [hover, setHover] = useState<string | null>(null);

  const rows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of [house, senate]) {
      for (const [st, n] of Object.entries(b?.stateCounts ?? {})) counts.set(st, (counts.get(st) ?? 0) + n);
    }
    return [...counts.entries()]
      .filter(([st]) => st in NAMES)
      .map(([st, bills]) => {
        const seats = seatsFor(st);
        return { st, name: NAMES[st], bills, seats, perMember: seats > 0 ? bills / seats : 0 };
      });
  }, [house, senate]);

  const value = (r: (typeof rows)[number]) => (metric === 'total' ? r.bills : r.perMember);
  const byState = new Map(rows.map((r) => [r.st, r]));
  const ranked = [...rows].sort((a, b) => value(b) - value(a));

  // Quintile breaks over the states on the map, so each shade holds ~a fifth.
  const breaks = useMemo(() => {
    const vals = rows.filter((r) => r.st in TILES).map(value).sort((a, b) => a - b);
    if (vals.length === 0) return [0, 0, 0, 0];
    return [0.2, 0.4, 0.6, 0.8].map((q) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, metric]);
  const binOf = (v: number) => breaks.filter((b) => v >= b).length; // 0..4
  const ALPHA = [0.12, 0.3, 0.5, 0.72, 0.95];

  const fmtVal = (v: number) => (metric === 'total' ? fmt(Math.round(v)) : v.toFixed(1));
  const unit = metric === 'total' ? 'bills' : 'bills per member';
  const focus = hover ? byState.get(hover) : null;

  const tile = (st: string, extra?: string) => {
    const r = byState.get(st);
    const v = r ? value(r) : 0;
    const bin = r ? binOf(v) : -1;
    return (
      <button
        key={st}
        type="button"
        onMouseEnter={() => setHover(st)}
        onFocus={() => setHover(st)}
        onClick={() => onDrillDown('state', st)}
        aria-label={`${NAMES[st]}: ${r ? fmtVal(v) : 0} ${unit}`}
        className={cn(
          'focus-ring relative flex aspect-square flex-col items-center justify-center rounded-xs transition-[opacity,box-shadow]',
          bin >= 3 ? 'text-on-ink' : 'text-ink',
          bin < 0 && 'bg-sunken',
          hover === st && 'ring-2 ring-ink',
          hover && hover !== st && 'opacity-60',
          extra,
        )}
        style={bin >= 0 ? { backgroundColor: `hsl(var(--heat) / ${ALPHA[bin]})` } : undefined}
      >
        <span className="font-mono text-[9px] font-medium leading-none sm:text-xs">{st}</span>
      </button>
    );
  };

  return (
    <section className="border-b border-line">
      <div className="container-editorial py-16 sm:py-24">
        <SectionHeader
          eyebrow="Across the country"
          title="Where bills come from"
          action={
            <SectionAsk
              question={`Which states' members sponsor the most bills in the ${formatCongressOrdinal(congress)} Congress?`}
            />
          }
        />
        <p className="mt-4 max-w-measure text-[15px] leading-relaxed text-ink-2">
          Bills sponsored by each state&rsquo;s members this Congress.
          {perMemberAvailable && ' Big delegations file more bills, so switch to per member for a fairer comparison.'}
        </p>

        <div className="mt-10 grid grid-cols-1 items-start gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="max-w-[36rem] lg:col-span-8" onMouseLeave={() => setHover(null)}>
            {perMemberAvailable && (
              <div className="mb-5 inline-flex rounded-md border border-line-strong p-0.5" role="tablist" aria-label="Measure">
                {(
                  [
                    ['total', 'Total bills'],
                    ['perMember', 'Per member'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={metric === id}
                    onClick={() => {
                      if (id === metric) return;
                      setMetric(id);
                      analytics.homeStateMapMeasureChanged(id === 'total' ? 'total' : 'per_member', congress);
                    }}
                    className={cn(
                      'focus-ring h-8 rounded-sm px-3 text-[13px] font-medium transition-colors touchable:h-10',
                      metric === id ? 'bg-ink text-on-ink' : 'text-ink-2 hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="grid grid-cols-11 gap-1 sm:gap-1.5">
              {Array.from({ length: 8 * 11 }, (_, i) => {
                const col = i % 11;
                const row = Math.floor(i / 11);
                const st = Object.keys(TILES).find((k) => TILES[k][0] === col && TILES[k][1] === row);
                return st ? tile(st) : <span key={`e${i}`} aria-hidden="true" />;
              })}
            </div>

            {TERRITORIES.some((t) => byState.has(t)) && (
              <div className="mt-3 flex items-center gap-3">
                <span className="label-eyebrow">Territories</span>
                <div className="grid grid-cols-11 gap-1 sm:gap-1.5 flex-1">
                  {TERRITORIES.filter((t) => byState.has(t)).map((t) => tile(t))}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-xs text-ink-3">
              <span>fewer</span>
              {ALPHA.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 tabular">
                  <span className="h-3 w-5 rounded-xs" style={{ backgroundColor: `hsl(var(--heat) / ${a})` }} />
                  {i === 0 ? `< ${fmtVal(breaks[0])}` : i === 4 ? `≥ ${fmtVal(breaks[3])}` : `${fmtVal(breaks[i - 1])}–${fmtVal(breaks[i])}`}
                </span>
              ))}
              <span>more {unit}</span>
            </div>
          </div>

          {/* Readout: the hovered state, or the top five */}
          <div className="lg:col-span-4" onMouseLeave={() => setHover(null)}>
            {focus ? (
              <div key={focus.st} className="animate-fade-in border-y border-line py-5">
                <p className="label-eyebrow">{focus.st}</p>
                <p className="mt-1 font-serif text-display-sm font-medium text-ink">{focus.name}</p>
                <p className="mt-4 font-serif text-[44px] font-normal leading-none text-ink tabular">{fmt(focus.bills)}</p>
                <p className="mt-1 text-sm text-ink-2">bills sponsored</p>
                {perMemberAvailable && focus.seats > 0 && (
                  <p className="mt-3 text-sm">
                    <span className="font-mono text-ink tabular">{focus.perMember.toFixed(1)}</span>{' '}
                    <span className="text-ink-2">
                      per member · {focus.seats} {focus.seats === 1 ? 'seat' : 'seats'}
                    </span>
                  </p>
                )}
                <p className="mt-2 font-mono text-xs text-ink-3">
                  #{ranked.findIndex((r) => r.st === focus.st) + 1} of {ranked.length} by {metric === 'total' ? 'total' : 'per member'}
                </p>
                <p className="mt-4 text-sm text-ink-3">Click to see its bills →</p>
              </div>
            ) : (
              <div>
                <p className="label-eyebrow mb-3">Top five · {metric === 'total' ? 'total bills' : 'per member'}</p>
                <ol className="border-b border-line">
                  {ranked.slice(0, 5).map((r, i) => (
                    <li key={r.st} className="border-t border-line">
                      <button
                        type="button"
                        onMouseEnter={() => setHover(r.st)}
                        onClick={() => onDrillDown('state', r.st)}
                        className="focus-ring grid min-h-12 w-full grid-cols-[1.25rem_1fr_auto] items-center gap-3 rounded-sm text-left hover:bg-sunken"
                      >
                        <span className="font-mono text-xs text-ink-3 tabular">{i + 1}</span>
                        <span className="text-[15px] text-ink">{r.name}</span>
                        <span className="font-mono text-sm text-ink tabular">{fmtVal(value(r))}</span>
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
