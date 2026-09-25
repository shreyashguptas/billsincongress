'use client';

/**
 * Leading sponsors as a bar chart rather than a table. One bar per member,
 * coloured by party, the count at the bar's end. The bars share one scale
 * starting at zero, so a member with twice the bills gets twice the bar.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal } from '@/lib/congress';
import { AskAbout } from '@/components/answers/ask-about';
import { fmt, type HomeProps } from './shared';

const PARTY: Record<string, { label: string; color: string }> = {
  D: { label: 'Democrat', color: 'hsl(var(--party-d))' },
  R: { label: 'Republican', color: 'hsl(var(--party-r))' },
  I: { label: 'Independent', color: 'hsl(var(--party-i))' },
};
const partyOf = (p?: string | null) =>
  PARTY[(p ?? '').trim().charAt(0).toUpperCase()] ?? { label: 'Party not recorded', color: 'hsl(var(--party-u))' };

export function SponsorsChart({
  congress,
  dashboard,
  onDrillDown,
}: Pick<HomeProps, 'congress' | 'dashboard' | 'onDrillDown'>) {
  const data = dashboard.topSponsors.slice(0, 10);
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((s) => s.count));
  const parties = [...new Set(data.map((s) => partyOf(s.party).label))];

  return (
    <section className="border-b border-border">
      <div className="container-editorial py-12">
        <header className="mb-6">
          <p className="label-eyebrow mb-2">The most prolific</p>
          <div className="flex items-start justify-between gap-4">
            <h2 className="font-serif text-display-sm font-semibold tracking-tight leading-tight">Leading sponsors</h2>
            <div className="shrink-0 pt-1.5">
              <AskAbout question={`Who introduces the most bills in the ${formatCongressOrdinal(congress)} Congress, and does that mean anything?`} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {parties.map((label) => {
              const p = Object.values(PARTY).find((x) => x.label === label) ?? partyOf(null);
              return (
                <span key={label} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: p.color }} />
                  {label}
                </span>
              );
            })}
          </div>
        </header>

        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sponsor data available.</p>
        ) : (
          <ol className="space-y-1" onMouseLeave={() => setHover(null)}>
            {data.map((s, i) => {
              const p = partyOf(s.party);
              return (
                <li key={s.name}>
                  <button
                    type="button"
                    onMouseEnter={() => setHover(s.name)}
                    onFocus={() => setHover(s.name)}
                    onClick={() => onDrillDown('sponsor', s.name)}
                    aria-label={`${s.name}, ${p.label}${s.state ? `, ${s.state}` : ''}: ${fmt(s.count)} bills`}
                    className={cn(
                      'grid w-full grid-cols-[1.5rem_minmax(0,11rem)_1fr] sm:grid-cols-[1.5rem_16rem_1fr] items-center gap-3 rounded-sm px-1 py-1.5 text-left transition-opacity',
                      hover && hover !== s.name && 'opacity-45',
                    )}
                  >
                    <span className="font-mono text-xs text-muted-foreground tabular">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.name}</span>
                      <span className="block font-mono text-[10px] text-muted-foreground">
                        {[s.party, s.state].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 rounded-r-[4px] animate-bar-grow origin-left"
                        style={{ width: `${(s.count / max) * 88}%`, backgroundColor: p.color, animationDelay: `${i * 40}ms` }}
                      />
                      <span className="font-mono text-sm tabular">{fmt(s.count)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-3 font-mono text-[10px] text-muted-foreground">Bills introduced as sponsor, this Congress. Click a member to see their bills.</p>
      </div>
    </section>
  );
}
