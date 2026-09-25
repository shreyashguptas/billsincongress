'use client';

/**
 * Section — "Where bills stand", zoomed.
 *
 * Replaces the 1,000 tiny squares from the first round. The bills that never
 * left committee are one small block on the left, each square standing for
 * many bills. The few that got out are zoomed in on the right: bigger squares,
 * one per bill, a row per stage — so the part of the story that is actually
 * happening is the part you can see. Each panel states its own scale, and
 * every square takes its stage's `status-*` colour (brand.md, "The data").
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal } from '@/lib/congress';
import { SectionHeader } from '@/components/brand/section';
import { stageFill } from '@/components/brand/status';
import { SectionAsk, fmt, type HomeProps } from './shared';

type SB = HomeProps['dashboard']['statusBreakdown'];

const STUCK = [
  { key: 'introduced', label: 'Introduced, no action yet', stage: 20 },
  { key: 'inCommittee', label: 'In committee', stage: 40 },
] as const;

const MOVED = [
  { key: 'passedOneChamber', label: 'Passed one chamber', stage: 60 },
  { key: 'passedBothChambers', label: 'Passed both chambers', stage: 80 },
  { key: 'toPresident', label: 'On the President’s desk', stage: 90 },
  { key: 'signed', label: 'Signed', stage: 95 },
  { key: 'becameLaw', label: 'Became law', stage: 100 },
  { key: 'vetoed', label: 'Vetoed', stage: 85 },
] as const;

/** Smallest "nice" unit that keeps a block under `maxSquares`. */
function unitFor(total: number, maxSquares: number) {
  for (const u of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) {
    if (total / u <= maxSquares) return u;
  }
  return Math.ceil(total / maxSquares);
}

const billsLabel = (n: number) => `${fmt(n)} ${n === 1 ? 'bill' : 'bills'}`;

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
    <section className="border-b border-line">
      <div className="container-editorial py-16 sm:py-24">
        <SectionHeader
          eyebrow="Where bills stand"
          finding
          title={
            <>
              {((stuckTotal / all) * 100).toFixed(1)}% of bills haven&rsquo;t made it out of committee. Here are the
              ones that have.
            </>
          }
          action={
            <SectionAsk
              question={`Why do most bills never leave committee in the ${formatCongressOrdinal(congress)} Congress?`}
            />
          }
        />

        <div className="mt-10 grid grid-cols-1 gap-12 sm:mt-12 lg:grid-cols-12 lg:gap-0">
          {/* Stuck — small squares, many bills each */}
          <div className="lg:col-span-4 lg:border-r lg:border-line lg:pr-10">
            <p className="label-eyebrow">Stuck · {billsLabel(stuckTotal)}</p>
            <p className="mt-1 font-mono text-xs text-ink-3">each square = {fmt(stuckUnit)} bills</p>
            <div className="mt-4 flex flex-wrap gap-[2px]">
              {stuck.flatMap((s) =>
                Array.from({ length: squares(s.value, stuckUnit) }, (_, i) => (
                  <button
                    key={`${s.key}${i}`}
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                    {...row(s)}
                    className={cn('h-2 w-2 rounded-xs transition-opacity', stageFill(s.stage), faded(s.key) && 'opacity-35')}
                  />
                )),
              )}
            </div>
            <ul className="mt-6 border-b border-line">
              {stuck.map((s) => (
                <li key={s.key} className="border-t border-line">
                  <button
                    type="button"
                    {...row(s)}
                    className={cn(
                      'focus-ring flex min-h-11 w-full items-center gap-3 rounded-sm text-left text-[15px] text-ink transition-opacity',
                      faded(s.key) && 'opacity-35',
                    )}
                  >
                    <span className={cn('h-3 w-3 shrink-0 rounded-xs', stageFill(s.stage))} aria-hidden="true" />
                    <span className="flex-1">{s.label}</span>
                    <span className="font-mono text-sm text-ink-2 tabular">{fmt(s.value)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Moved — zoomed in, one bigger square per bill */}
          <div className="lg:col-span-8 lg:pl-10">
            <p className="label-eyebrow">
              Zoomed in · the {fmt(movedTotal)} that moved ({((movedTotal / all) * 100).toFixed(1)}%)
            </p>
            <p className="mt-1 font-mono text-xs text-ink-3">
              each square = {movedUnit === 1 ? '1 bill' : `${fmt(movedUnit)} bills`}
            </p>
            <div className="mt-4 border-b border-line">
              {moved.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  {...row(s)}
                  className={cn(
                    'focus-ring group grid w-full grid-cols-1 items-start gap-x-6 gap-y-3 rounded-sm border-t border-line py-4 text-left transition-opacity sm:grid-cols-[200px_1fr]',
                    faded(s.key) && 'opacity-35',
                  )}
                >
                  <span className="flex items-baseline justify-between gap-3 sm:block">
                    <span className="block text-[15px] font-medium leading-5 text-ink">{s.label}</span>
                    <span className="mt-1 block font-mono text-[13px] text-ink-2 tabular group-hover:text-ink">
                      {billsLabel(s.value)} →
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-[3px] sm:pt-1">
                    {Array.from({ length: squares(s.value, movedUnit) }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-3 w-3 rounded-xs animate-odds-in',
                          stageFill(s.stage),
                          s.key === 'becameLaw' && 'odds-law',
                        )}
                        style={{ animationDelay: `${Math.min(i, 200) * 4}ms` }}
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
