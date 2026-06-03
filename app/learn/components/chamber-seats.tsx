'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// "Congress is two rooms" — parliament-style seat charts for the House (435)
// and Senate (100), with a state picker that lights up your state's seats.
// ─────────────────────────────────────────────────────────────────────────────

/** House seats per state, 2020-census apportionment. Sums to 435. */
const STATE_HOUSE_SEATS: Record<string, number> = {
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

const STATE_NAMES = Object.keys(STATE_HOUSE_SEATS).sort();

type Seat = { x: number; y: number; row: number; sweepIndex: number };

/**
 * Lay out `total` seats in concentric semicircular rows (a hemicycle), the way
 * election-night seat charts draw a chamber. Returns seats tagged with a
 * left-to-right sweep order so a contiguous wedge can be highlighted.
 */
function buildHemicycle(
  total: number,
  rows: number,
  innerRadius: number,
  outerRadius: number,
  cx: number,
  cy: number,
): Seat[] {
  const radii = Array.from(
    { length: rows },
    (_, i) => innerRadius + ((outerRadius - innerRadius) * i) / (rows - 1),
  );
  const radiiSum = radii.reduce((a, b) => a + b, 0);

  // Seats per row, proportional to row length, corrected to hit the exact total.
  const seatsPerRow = radii.map((r) => Math.round((r / radiiSum) * total));
  let diff = total - seatsPerRow.reduce((a, b) => a + b, 0);
  let fixRow = rows - 1;
  while (diff !== 0) {
    seatsPerRow[fixRow] += Math.sign(diff);
    diff -= Math.sign(diff);
    fixRow = fixRow === 0 ? rows - 1 : fixRow - 1;
  }

  const seats: (Seat & { angle: number })[] = [];
  radii.forEach((radius, row) => {
    const count = seatsPerRow[row];
    for (let s = 0; s < count; s++) {
      const t = count === 1 ? 0.5 : s / (count - 1);
      const angle = Math.PI * (1 - t); // π → 0, left to right
      seats.push({
        // Round to 2 decimals: SVG doesn't need more, and full float precision
        // differs between Node and browser trig, causing hydration mismatches.
        x: Math.round((cx + radius * Math.cos(angle)) * 100) / 100,
        y: Math.round((cy - radius * Math.sin(angle)) * 100) / 100,
        row,
        angle,
        sweepIndex: 0,
      });
    }
  });

  // Left-to-right sweep order across all rows → wedge highlighting.
  seats.sort((a, b) => b.angle - a.angle);
  seats.forEach((seat, i) => {
    seat.sweepIndex = i;
  });
  return seats;
}

function SeatChart({
  seats,
  rows,
  viewBox,
  dotRadius,
  highlightCount,
  label,
}: {
  seats: Seat[];
  rows: number;
  viewBox: string;
  dotRadius: number;
  highlightCount: number;
  label: string;
}) {
  // Group by row so the chamber "fills up" row by row — far cheaper than
  // animating hundreds of individual dots. Reduced motion is handled globally
  // by LearnMotionProvider.
  const byRow = useMemo(() => {
    const groups: Seat[][] = Array.from({ length: rows }, () => []);
    seats.forEach((seat) => groups[seat.row].push(seat));
    return groups;
  }, [seats, rows]);

  return (
    <svg viewBox={viewBox} role="img" aria-label={label} className="w-full h-auto">
      {byRow.map((rowSeats, rowIdx) => (
        <motion.g
          key={rowIdx}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{
            duration: 0.5,
            delay: rowIdx * 0.08,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {rowSeats.map((seat) => (
            <circle
              key={seat.sweepIndex}
              cx={seat.x}
              cy={seat.y}
              r={dotRadius}
              className={cn(
                'transition-[fill] duration-500',
                seat.sweepIndex < highlightCount
                  ? 'fill-accent'
                  : 'fill-foreground/25 dark:fill-foreground/30',
              )}
            />
          ))}
        </motion.g>
      ))}
    </svg>
  );
}

export function ChamberSeats() {
  const [stateName, setStateName] = useState<string | null>(null);

  const houseSeats = useMemo(() => buildHemicycle(435, 12, 62, 178, 190, 192), []);
  const senateSeats = useMemo(() => buildHemicycle(100, 5, 52, 122, 130, 134), []);

  const repCount = stateName ? STATE_HOUSE_SEATS[stateName] : 0;

  const handleStateChange = (value: string) => {
    setStateName(value);
    analytics.learnStateSelected(value, STATE_HOUSE_SEATS[value]);
  };

  return (
    <div className="space-y-8">
      {/* State picker */}
      <div className="border border-border bg-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4">
          <div className="flex-1">
            <label
              htmlFor="learn-state-picker"
              className="label-eyebrow block mb-2"
            >
              Make it personal
            </label>
            <p className="font-serif text-lg sm:text-xl font-semibold tracking-tight">
              Where do you live?
            </p>
          </div>
          <div className="w-full sm:w-64">
            <Select value={stateName ?? undefined} onValueChange={handleStateChange}>
              <SelectTrigger id="learn-state-picker" aria-label="Choose your state">
                <SelectValue placeholder="Choose your state…" />
              </SelectTrigger>
              <SelectContent className="max-h-[280px]">
                {STATE_NAMES.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Result line */}
        <div aria-live="polite">
          {stateName ? (
            <motion.p
              key={stateName}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-4 border-t border-border pt-4 text-sm sm:text-base leading-relaxed"
            >
              <span className="font-semibold">{stateName}</span> sends{' '}
              <span className="font-semibold text-accent tabular">
                {repCount} {repCount === 1 ? 'Representative' : 'Representatives'}
              </span>{' '}
              to the House and — like every state, big or small —{' '}
              <span className="font-semibold text-accent tabular">2 Senators</span> to the
              Senate. They're shown in red below.
            </motion.p>
          ) : (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              Pick your state to light up its seats in the two chambers below.
            </p>
          )}
        </div>
      </div>

      {/* The two chambers, side by side */}
      <div className="grid sm:grid-cols-2 gap-px bg-border border border-border">
        <div className="bg-background p-6 sm:p-8">
          <p className="label-eyebrow mb-1">The People's Chamber</p>
          <h3 className="font-serif text-xl sm:text-2xl font-semibold tracking-tight mb-1">
            House of Representatives
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            <span className="font-mono tabular text-foreground">435</span> members · seats
            divided by population — bigger states, more seats.
          </p>
          <SeatChart
            seats={houseSeats}
            rows={12}
            viewBox="0 0 380 200"
            dotRadius={3.2}
            highlightCount={repCount}
            label={`Seat chart of the House of Representatives showing 435 seats${stateName ? `, with ${stateName}'s ${repCount} seats highlighted` : ''}`}
          />
          <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Elected every</dt>
              <dd className="font-mono tabular">2 years</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Minimum age</dt>
              <dd className="font-mono tabular">25</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Led by</dt>
              <dd>the Speaker of the House</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Personality</dt>
              <dd>Big, loud, fast-moving</dd>
            </div>
          </dl>
        </div>

        <div className="bg-background p-6 sm:p-8">
          <p className="label-eyebrow mb-1">The States' Chamber</p>
          <h3 className="font-serif text-xl sm:text-2xl font-semibold tracking-tight mb-1">
            Senate
          </h3>
          <p className="text-sm text-muted-foreground mb-6">
            <span className="font-mono tabular text-foreground">100</span> members · every
            state gets exactly 2, no matter its size.
          </p>
          <div className="max-w-[280px] mx-auto sm:mx-0">
            <SeatChart
              seats={senateSeats}
              rows={5}
              viewBox="0 0 260 140"
              dotRadius={4}
              highlightCount={stateName ? 2 : 0}
              label={`Seat chart of the Senate showing 100 seats${stateName ? `, with ${stateName}'s 2 seats highlighted` : ''}`}
            />
          </div>
          <dl className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Elected every</dt>
              <dd className="font-mono tabular">6 years</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Minimum age</dt>
              <dd className="font-mono tabular">30</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Led by</dt>
              <dd>the Vice President</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Personality</dt>
              <dd>Small, slow, deliberate</dd>
            </div>
          </dl>
        </div>
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
        Why two chambers? The founders wanted big states and small states to both feel
        fairly treated — and they wanted every new law to be checked twice, by two
        differently-shaped rooms, before it could touch anyone's life.
      </p>
    </div>
  );
}
