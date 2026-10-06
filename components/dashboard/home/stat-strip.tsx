'use client';

/**
 * Four headline counts under the hero, in a row with hairline dividers rather
 * than cards (brand.md, "Layout and shape"); two by two on a phone. Every cell
 * behaves the same way — the old row had two clickable cells and two dead
 * ones, which read as broken. Each one opens its bills, carries one line of
 * context, and shares one hover.
 */

import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fmt, type HomeProps } from './shared';

export function StatStrip({ congress, dashboard, onDrillDown }: Pick<HomeProps, 'congress' | 'dashboard' | 'onDrillDown'>) {
  const total = Math.max(dashboard.totalBills, 1);
  const laws = dashboard.statusBreakdown.becameLaw;
  const pct = (n: number) => `${Math.round((n / total) * 100)}% of the total`;
  // Every count here includes resolutions, which are not bills, so the labels
  // say so. The odds of becoming law divide by the measures that CAN become law
  // (bills and joint resolutions); a resolution never goes to the President.
  const lawCapable = dashboard.lawCapableCount;
  const lawNote =
    laws === 0
      ? 'none yet'
      : lawCapable
        ? `about 1 in ${fmt(Math.round(lawCapable / laws))} that could`
        : `of ${fmt(dashboard.totalBills)} bills and resolutions`;

  const cells = [
    { label: 'Bills and resolutions', value: dashboard.totalBills, note: 'House and Senate', go: () => onDrillDown('congress', congress) },
    { label: 'From the House', value: dashboard.houseCount, note: pct(dashboard.houseCount), go: () => onDrillDown('chamber', 'house') },
    { label: 'From the Senate', value: dashboard.senateCount, note: pct(dashboard.senateCount), go: () => onDrillDown('chamber', 'senate') },
    {
      label: 'Became law',
      value: laws,
      note: lawNote,
      go: () => onDrillDown('status', 100),
      law: true,
    },
  ];

  return (
    <section className="border-b border-line">
      <div className="container-editorial py-12 sm:py-16">
        <div className="grid grid-cols-2 lg:grid-cols-4">
          {cells.map((c, i) => (
            <button
              key={c.label}
              type="button"
              onClick={c.go}
              className={cn(
                'focus-ring group rounded-sm py-5 pr-4 text-left sm:pr-8 lg:py-1',
                // Hairlines between cells: a column rule before the right-hand
                // cell of each phone row and before all but the first on
                // desktop, and a row rule above the second phone row.
                i % 2 === 1 && 'border-l border-line pl-4 sm:pl-8',
                i === 2 && 'lg:border-l lg:pl-8',
                i >= 2 && 'border-t border-line lg:border-t-0',
              )}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-medium text-ink-2">
                {c.label}
                <ArrowRight
                  aria-hidden="true"
                  strokeWidth={1.75}
                  className="h-4 w-4 -translate-x-1 text-ink-3 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100"
                />
              </span>
              <span
                className={cn(
                  'mt-3 block font-serif text-[40px] font-normal leading-none tracking-[-0.02em] tabular sm:text-[56px]',
                  c.law ? 'text-status-law' : 'text-ink',
                )}
              >
                {fmt(c.value)}
              </span>
              <span className="mt-3 block font-mono text-xs text-ink-3">{c.note}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
