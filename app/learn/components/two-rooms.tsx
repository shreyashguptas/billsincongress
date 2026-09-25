'use client';

import { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { analytics } from '@/lib/analytics';
import { buildHemicycle, type Seat } from './hemicycle';

// The Learn page's one interaction: the House (435) and the Senate (100) drawn
// seat by seat, and a state picker that fills in that state's seats in ink.
// These seats are not party data, so no party colour appears here.

/** House seats per state, 2020-census apportionment. Sums to 435. */
const HOUSE_SEATS: Record<string, number> = {
  Alabama: 7, Alaska: 1, Arizona: 9, Arkansas: 4, California: 52,
  Colorado: 8, Connecticut: 5, Delaware: 1, Florida: 28, Georgia: 14,
  Hawaii: 2, Idaho: 2, Illinois: 17, Indiana: 9, Iowa: 4,
  Kansas: 4, Kentucky: 6, Louisiana: 6, Maine: 2, Maryland: 8,
  Massachusetts: 9, Michigan: 13, Minnesota: 8, Mississippi: 4, Missouri: 8,
  Montana: 2, Nebraska: 3, Nevada: 4, 'New Hampshire': 2, 'New Jersey': 12,
  'New Mexico': 3, 'New York': 26, 'North Carolina': 14, 'North Dakota': 1, Ohio: 15,
  Oklahoma: 5, Oregon: 6, Pennsylvania: 17, 'Rhode Island': 2, 'South Carolina': 7,
  'South Dakota': 1, Tennessee: 9, Texas: 38, Utah: 4, Vermont: 1,
  Virginia: 11, Washington: 10, 'West Virginia': 2, Wisconsin: 8, Wyoming: 1,
};
const STATES = Object.keys(HOUSE_SEATS).sort();

// Built once per page load, not per render.
const HOUSE = buildHemicycle(435, 12, 62, 178, 190, 192);
const SENATE = buildHemicycle(100, 5, 52, 122, 130, 134);

function Seats({ seats, lit, r, viewBox, label }: { seats: Seat[]; lit: number; r: number; viewBox: string; label: string }) {
  return (
    // Unlit seats take the svg's fill; only lit seats carry a class. That keeps
    // 535 circles' worth of markup small.
    <svg viewBox={viewBox} role="img" aria-label={label} className="h-auto w-full fill-ink/20 [&_circle]:transition-[fill] [&_circle]:duration-300">
      {seats.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={r} className={i < lit ? 'fill-ink' : undefined} />
      ))}
    </svg>
  );
}

export function TwoRooms() {
  const [state, setState] = useState<string | null>(null);
  const reps = state ? HOUSE_SEATS[state] : 0;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label htmlFor="learn-state" className="text-title text-ink">
          Find your state
        </label>
        <div className="w-full sm:w-64">
          <Select
            value={state ?? undefined}
            onValueChange={(value) => {
              setState(value);
              analytics.learnStateSelected(value, HOUSE_SEATS[value]);
            }}
          >
            <SelectTrigger id="learn-state">
              <SelectValue placeholder="Choose a state" />
            </SelectTrigger>
            <SelectContent className="max-h-[280px]">
              {STATES.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p aria-live="polite" className="text-ink-2 sm:ml-2">
          {state && (
            <>
              <span className="font-medium text-ink">{state}:</span>{' '}
              <span className="font-mono tabular text-ink">{reps}</span> in the House,{' '}
              <span className="font-mono tabular text-ink">2</span> in the Senate.
            </>
          )}
        </p>
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-[3fr_2fr] md:items-end md:gap-12">
        <figure>
          <Seats
            seats={HOUSE}
            lit={reps}
            r={3.2}
            viewBox="0 0 380 200"
            label={`The House: 435 seats${state ? `, ${reps} of them from ${state}` : ''}.`}
          />
          <figcaption className="mt-4 flex items-baseline gap-3">
            <span className="font-serif text-display-lg leading-none text-ink tabular">435</span>
            <span>
              <span className="block text-title text-ink">The House</span>
              <span className="block text-ink-2">Big states get more seats.</span>
            </span>
          </figcaption>
        </figure>
        <figure>
          <div className="mx-auto max-w-[300px] md:max-w-none">
            <Seats
              seats={SENATE}
              lit={state ? 2 : 0}
              r={4}
              viewBox="0 0 260 140"
              label={`The Senate: 100 seats${state ? `, 2 of them from ${state}` : ''}.`}
            />
          </div>
          <figcaption className="mt-4 flex items-baseline gap-3">
            <span className="font-serif text-display-lg leading-none text-ink tabular">100</span>
            <span>
              <span className="block text-title text-ink">The Senate</span>
              <span className="block text-ink-2">Every state gets 2.</span>
            </span>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
