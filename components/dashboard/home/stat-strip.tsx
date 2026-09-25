'use client';

/**
 * Four headline counts under the hero. Every cell behaves the same way — the
 * old row had two clickable cells and two dead ones, which read as broken. Each
 * one now opens its bills, carries one line of context, and shares one hover.
 */

import { ArrowRight } from 'lucide-react';
import { fmt, type HomeProps } from './shared';

export function StatStrip({ congress, dashboard, onDrillDown }: Pick<HomeProps, 'congress' | 'dashboard' | 'onDrillDown'>) {
  const total = Math.max(dashboard.totalBills, 1);
  const laws = dashboard.statusBreakdown.becameLaw;
  const pct = (n: number) => `${Math.round((n / total) * 100)}% of all bills`;

  const cells = [
    { label: 'Bills introduced', value: dashboard.totalBills, note: 'House and Senate', go: () => onDrillDown('congress', congress) },
    { label: 'House bills', value: dashboard.houseCount, note: pct(dashboard.houseCount), go: () => onDrillDown('chamber', 'house') },
    { label: 'Senate bills', value: dashboard.senateCount, note: pct(dashboard.senateCount), go: () => onDrillDown('chamber', 'senate') },
    {
      label: 'Became law',
      value: laws,
      note: laws > 0 ? `about 1 in ${fmt(Math.round(total / laws))} bills` : 'none yet',
      go: () => onDrillDown('status', 100),
    },
  ];

  return (
    <section className="border-b border-border">
      <div className="container-editorial py-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px overflow-hidden rounded-sm border border-border bg-border">
          {cells.map((c) => (
            <button
              key={c.label}
              type="button"
              onClick={c.go}
              className="group bg-background px-5 py-4 text-left transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none"
            >
              <span className="flex items-center justify-between label-eyebrow">
                {c.label}
                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
              </span>
              <span className="mt-2 block font-serif text-3xl sm:text-4xl font-semibold tracking-tight tabular">
                {fmt(c.value)}
              </span>
              <span className="mt-1 block font-mono text-[11px] text-muted-foreground">{c.note}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
