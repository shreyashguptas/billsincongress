'use client';

/**
 * Section — "Where bills stand", zoomed.
 *
 * Replaces the 1,000 tiny squares from the first round. The bills that never
 * left committee are one small block on the left, each square standing for
 * many bills. The few that got out are zoomed in on the right: bigger squares,
 * one per bill, a row per stage — so the part of the story that is actually
 * happening is the part you can see. Each panel states its own scale.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal } from '@/lib/congress';
import { AskAbout } from '@/components/answers/ask-about';
import { fmt, type HomeProps } from './shared';

type SB = HomeProps['dashboard']['statusBreakdown'];

const STUCK = [
  { key: 'introduced', label: 'Introduced, no action yet', color: 'hsl(var(--status-introduced))', stage: 20 },
  { key: 'inCommittee', label: 'In committee', color: 'hsl(var(--status-committee))', stage: 40 },
] as const;

const MOVED = [
  { key: 'passedOneChamber', label: 'Passed one chamber', color: 'hsl(var(--status-passed-one))', stage: 60 },
  { key: 'passedBothChambers', label: 'Passed both chambers', color: 'hsl(var(--status-passed-both))', stage: 80 },
  { key: 'toPresident', label: 'On the President’s desk', color: 'hsl(var(--status-president))', stage: 90 },
  { key: 'signed', label: 'Signed', color: 'hsl(var(--status-signed))', stage: 95 },
  { key: 'becameLaw', label: 'Became law', color: 'hsl(var(--status-law))', stage: 100 },
  { key: 'vetoed', label: 'Vetoed', color: 'hsl(var(--status-vetoed))', stage: 85 },
] as const;

/** Smallest "nice" unit that keeps a block under `maxSquares`. */
function unitFor(total: number, maxSquares: number) {
  for (const u of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (total / u <= maxSquares) return u;
  }
  return Math.ceil(total / maxSquares);
}

export function StageZoom({
  congress,
  dashboard,
  onDrillDown,
}: Pick<HomeProps, 'congress' | 'dashboard' | 'onDrillDown'>) {
  const sb: SB = dashboard.statusBreakdown;
  const [hover, setHover] = useState<string | null>(null);

  const stuck = STUCK.map((s) => ({ ...s, value: sb[s.key] }));
  const moved = MOVED.map((s) => ({ ...s, value: sb[s.key] })).filter((s) => s.value > 0);
  const stuckTotal = stuck.reduce((a, s) => a + s.value, 0);
  const movedTotal = moved.reduce((a, s) => a + s.value, 0);
  const all = Math.max(stuckTotal + movedTotal, 1);

  const stuckUnit = unitFor(stuckTotal, 380);
  const movedUnit = unitFor(movedTotal, 600);
  // Every non-empty stage gets at least one square, so "Vetoed: 2" is never invisible.
  const squares = (v: number, u: number) => (v > 0 ? Math.max(1, Math.round(v / u)) : 0);

  const row = (s: (typeof moved)[number] | (typeof stuck)[number]) => ({
    onMouseEnter: () => setHover(s.key),
    onMouseLeave: () => setHover(null),
    onClick: () => onDrillDown('status', s.stage),
  });
  const faded = (k: string) => hover !== null && hover !== k;

  return (
    <section className="border-b border-border">
      <div className="container-editorial py-12">
        <header className="mb-8">
          <p className="label-eyebrow mb-2">Where bills stand</p>
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-serif text-display-sm font-semibold tracking-tight leading-tight max-w-2xl">
              {((stuckTotal / all) * 100).toFixed(1)}% of bills haven&rsquo;t made it out of committee. Here are the ones that have.
            </h2>
            <div className="shrink-0 pt-1.5">
              <AskAbout question={`Why do most bills never leave committee in the ${formatCongressOrdinal(congress)} Congress?`} />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-0">
          {/* Stuck — small squares, many bills each */}
          <div className="lg:col-span-4 lg:pr-8 lg:border-r lg:border-border">
            <p className="label-eyebrow">Stuck · {fmt(stuckTotal)} bills</p>
            <p className="font-mono text-[10px] text-muted-foreground mb-3">each square = {fmt(stuckUnit)} bills</p>
            <div className="flex flex-wrap gap-[2px]">
              {stuck.flatMap((s) =>
                Array.from({ length: squares(s.value, stuckUnit) }, (_, i) => (
                  <button
                    key={`${s.key}${i}`}
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    {...row(s)}
                    className={cn('h-[7px] w-[7px] rounded-[1px] transition-opacity', faded(s.key) && 'opacity-20')}
                    style={{ backgroundColor: s.color }}
                  />
                )),
              )}
            </div>
            <ul className="mt-4 space-y-1">
              {stuck.map((s) => (
                <li key={s.key}>
                  <button type="button" {...row(s)} className={cn('flex w-full items-center gap-2 text-sm text-left transition-opacity', faded(s.key) && 'opacity-40')}>
                    <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: s.color }} />
                    <span className="flex-1">{s.label}</span>
                    <span className="font-mono tabular">{fmt(s.value)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Moved — zoomed in, one bigger square per bill */}
          <div className="lg:col-span-8 lg:pl-8">
            <p className="label-eyebrow">
              Zoomed in · the {fmt(movedTotal)} that moved{' '}
              <span className="normal-case tracking-normal font-normal">({((movedTotal / all) * 100).toFixed(1)}%)</span>
            </p>
            <p className="font-mono text-[10px] text-muted-foreground mb-3">
              each square = {movedUnit === 1 ? '1 bill' : `${fmt(movedUnit)} bills`}
            </p>
            <div className="space-y-3">
              {moved.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  {...row(s)}
                  className={cn(
                    'grid w-full grid-cols-[9.5rem_1fr] sm:grid-cols-[11rem_1fr] items-start gap-3 text-left transition-opacity group',
                    faded(s.key) && 'opacity-30',
                  )}
                >
                  <span className="text-sm leading-tight">
                    {s.label}
                    <span className="block font-mono text-xs text-muted-foreground tabular group-hover:text-foreground">
                      {fmt(s.value)} {s.value === 1 ? 'bill' : 'bills'} →
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-[3px] pt-0.5">
                    {Array.from({ length: squares(s.value, movedUnit) }, (_, i) => (
                      <span
                        key={i}
                        className={cn('h-3 w-3 rounded-[2px] animate-odds-in', s.key === 'becameLaw' && 'odds-law')}
                        style={{ backgroundColor: s.color, animationDelay: `${Math.min(i, 200) * 4}ms` }}
                      />
                    ))}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
