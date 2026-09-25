'use client';

/**
 * The chamber chart shared by both hero variants (after The Lobby's roll-call
 * page). Outer seats: every bill, split by the sponsor's party, one seat per a
 * fixed number of bills. Inner seats, ringed in green: the bills that became
 * law, one seat each. `well` renders in the hollow of the arc.
 */

import { useMemo } from 'react';
import { fmt } from './shared';

export const PARTIES = [
  { key: 'D', label: 'Democrats', short: 'Dem.', color: 'hsl(var(--party-d))' },
  { key: 'I', label: 'Independents', short: 'Ind.', color: 'hsl(var(--party-i))' },
  { key: 'U', label: 'Party not recorded', short: 'Other', color: 'hsl(var(--party-u))' },
  { key: 'R', label: 'Republicans', short: 'Rep.', color: 'hsl(var(--party-r))' },
] as const;
export type PartyKey = (typeof PARTIES)[number]['key'];
export type PartyCounts = Record<PartyKey, number>;

export const OUTER_SEATS = 435;

/** Outer seats actually drawn: one per bill when a Congress has fewer than 435. */
export const outerSeatsFor = (totalBills: number) => Math.min(OUTER_SEATS, totalBills);
const MAX_LAW_SEATS = 400;

const W = 800;
const CX = W / 2;
const CY = 400;

// Fixed precision so server and client render identical attributes.
const round2 = (n: number) => Math.round(n * 100) / 100;
const colorOf = (k: PartyKey) => PARTIES.find((p) => p.key === k)!.color;

interface Seat {
  x: number;
  y: number;
  r: number;
  party: PartyKey;
}

/**
 * Classic parliament layout: seats on concentric arcs, each row holding seats
 * in proportion to its length, then every seat sorted by angle so each party
 * reads as one wedge from left to right.
 */
function layout(counts: PartyCounts, seats: number, rInner: number, rOuter: number, rows: number): Seat[] {
  if (seats <= 0) return [];
  const radii = Array.from({ length: rows }, (_, i) =>
    rows === 1 ? (rInner + rOuter) / 2 : rInner + ((rOuter - rInner) * i) / (rows - 1),
  );
  const sumR = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map((r) => Math.max(1, Math.round((seats * r) / sumR)));
  let diff = seats - perRow.reduce((a, b) => a + b, 0);
  for (let i = rows - 1; diff !== 0; i = (i - 1 + rows) % rows) {
    perRow[i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  const spacing = rows === 1 ? 14 : (rOuter - rInner) / (rows - 1);
  const dot = round2(Math.min(6, spacing * 0.36, ((Math.PI * rOuter) / perRow[rows - 1]) * 0.36));

  const pts: Array<{ x: number; y: number; a: number }> = [];
  radii.forEach((r, ri) => {
    const n = perRow[ri];
    for (let k = 0; k < n; k++) {
      const a = n === 1 ? Math.PI / 2 : Math.PI - (Math.PI * k) / (n - 1);
      pts.push({ x: round2(CX + r * Math.cos(a)), y: round2(CY - r * Math.sin(a)), a });
    }
  });
  pts.sort((p, q) => q.a - p.a);

  // Largest-remainder split of seats by party.
  const total = PARTIES.reduce((s, p) => s + counts[p.key], 0) || 1;
  const raw = PARTIES.map((p) => (counts[p.key] / total) * pts.length);
  const alloc = raw.map(Math.floor);
  let left = pts.length - alloc.reduce((a, b) => a + b, 0);
  raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem)
    .forEach(({ i }) => {
      if (left-- > 0) alloc[i]++;
    });

  const out: Seat[] = [];
  let pi = 0;
  let used = 0;
  for (const p of pts) {
    while (pi < PARTIES.length - 1 && used >= alloc[pi]) {
      pi++;
      used = 0;
    }
    out.push({ x: p.x, y: p.y, r: dot, party: PARTIES[pi].key });
    used++;
  }
  return out;
}

export function Hemicycle({
  bills,
  laws,
  hover,
  onHover,
  well,
}: {
  bills: PartyCounts;
  laws: PartyCounts;
  hover: PartyKey | null;
  onHover: (p: PartyKey | null) => void;
  well?: React.ReactNode;
}) {
  const totalBills = PARTIES.reduce((s, p) => s + bills[p.key], 0);
  const totalLaws = PARTIES.reduce((s, p) => s + laws[p.key], 0);
  const lawSeatCount = Math.min(totalLaws, MAX_LAW_SEATS);

  const billSeats = useMemo(
    () => layout(bills, outerSeatsFor(totalBills), 250, 385, 9),
    [JSON.stringify(bills), totalBills], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // More laws → more rows, growing inward, so each seat stays big enough to
  // read its party colour. Six rows at most keeps the hollow wide enough for
  // the readout.
  const lawRows = Math.min(6, Math.max(3, Math.ceil(lawSeatCount / 60)));
  const lawSeats = useMemo(
    () => layout(laws, lawSeatCount, 222 - (lawRows - 1) * 16, 222, lawRows),
    [JSON.stringify(laws), lawSeatCount, lawRows], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const dim = (p: PartyKey) => hover !== null && hover !== p;

  // No party breakdown yet (a new Congress's first sync writes that row last).
  // Drawing seats from all-zero counts would hand every one to the last party
  // in the list — an all-Republican chamber that no data supports.
  if (totalBills === 0) {
    return (
      <div className="flex aspect-[80/41] w-full items-center justify-center rounded-t-full border border-dashed border-border">
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          The party breakdown for this Congress hasn&rsquo;t been built yet. It fills in after the next nightly update.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${CY + 10}`}
        className="w-full h-auto"
        role="img"
        aria-label={`${fmt(totalBills)} bills by sponsor party; ${fmt(totalLaws)} became law`}
        onMouseLeave={() => onHover(null)}
      >
        {billSeats.map((s, i) => (
          <circle
            key={`b${i}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={colorOf(s.party)}
            opacity={dim(s.party) ? 0.1 : 0.5}
            className="transition-opacity duration-200"
            onMouseEnter={() => onHover(s.party)}
          />
        ))}
        {lawSeats.map((s, i) => (
          <circle
            key={`l${i}-${s.party}`}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill={colorOf(s.party)}
            stroke="hsl(var(--status-law))"
            // Thin the ring on small seats so the party colour still reads.
            strokeWidth={Math.min(1, s.r * 0.2)}
            opacity={dim(s.party) ? 0.12 : 1}
            className="transition-opacity duration-200 animate-seat-in"
            style={{ animationDelay: `${250 + i * 5}ms` }}
            onMouseEnter={() => onHover(s.party)}
          />
        ))}
      </svg>
      {well && (
        <>
          {/* The hollow of the arc: centred, bottom-aligned, ~40% of the width.
              Too narrow on a phone, so there it sits under the arc instead. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto hidden w-[40%] flex-col items-center justify-end text-center sm:flex">
            {well}
          </div>
          <div className="mt-2 text-center sm:hidden">{well}</div>
        </>
      )}
    </div>
  );
}

/**
 * "= 1" only when a seat really is exactly one; any scaled seat says "≈", with
 * one decimal under 10 so 600 bills on 435 seats reads "≈ 1.4", not "= 1".
 */
function perSeatLabel(total: number, seats: number, one: string, many: string) {
  if (total <= seats) return `= 1 ${one}`;
  const per = total / seats;
  return `≈ ${per < 10 ? per.toFixed(1) : fmt(Math.round(per))} ${many}`;
}

/** The one-line scale note — the only caption the chart needs. */
export function HemicycleKey({ totalBills, totalLaws }: { totalBills: number; totalLaws: number }) {
  if (totalBills === 0) return null;
  return (
    <p className="font-mono text-[10px] text-muted-foreground">
      outer seat {perSeatLabel(totalBills, OUTER_SEATS, 'bill', 'bills')}
      <span className="mx-2 opacity-50">|</span>
      <span className="inline-block h-2 w-2 rounded-full align-middle mr-1 ring-1" style={{ '--tw-ring-color': 'hsl(var(--status-law))' } as React.CSSProperties} />
      inner seat {perSeatLabel(totalLaws, MAX_LAW_SEATS, 'law', 'laws')}
    </p>
  );
}

/** Big number in the well: the headline fact, or the hovered party's. */
export function WellReadout({
  hover,
  bills,
  laws,
  scope,
}: {
  hover: PartyKey | null;
  bills: PartyCounts;
  laws: PartyCounts;
  scope?: string;
}) {
  const p = hover ? PARTIES.find((x) => x.key === hover)! : null;
  const b = p ? bills[p.key] : PARTIES.reduce((s, x) => s + bills[x.key], 0);
  const l = p ? laws[p.key] : PARTIES.reduce((s, x) => s + laws[x.key], 0);
  return (
    <div key={hover ?? 'all'} className="animate-fade-in pb-1">
      <p className="label-eyebrow" style={p ? { color: p.color } : undefined}>
        {p ? p.label : scope ?? 'All bills'}
      </p>
      <p className="font-serif text-4xl sm:text-5xl font-semibold tabular leading-none mt-1" style={{ color: 'hsl(var(--status-law))' }}>
        {fmt(l)}
      </p>
      <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
        became law, of <span className="font-mono text-foreground">{fmt(b)}</span> bills
      </p>
    </div>
  );
}
