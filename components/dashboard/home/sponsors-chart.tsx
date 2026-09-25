'use client';

/**
 * Leading sponsors as a bar chart rather than a table. One bar per member,
 * coloured by party (this is party data, so the party hues belong here), the
 * count at the bar's end. The bars share one scale starting at zero, so a
 * member with twice the bills gets twice the bar.
 */

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal } from '@/lib/congress';
import { SectionHeader } from '@/components/brand/section';
import { PartyDot, PartyTag } from '@/components/brand/party';
import { SectionAsk, fmt, type HomeProps } from './shared';

const PARTY: Record<string, { label: string; fill: string }> = {
  D: { label: 'Democrat', fill: 'bg-party-d' },
  I: { label: 'Independent', fill: 'bg-party-i' },
  R: { label: 'Republican', fill: 'bg-party-r' },
};
const UNRECORDED = { code: null, label: 'Party not recorded', fill: 'bg-party-u' };
/** The data may hold a letter or a full name; the first letter decides. */
const partyOf = (p?: string | null) => {
  const code = (p ?? '').trim().charAt(0).toUpperCase();
  return code in PARTY ? { code, ...PARTY[code] } : UNRECORDED;
};

export function SponsorsChart({
  congress,
  dashboard,
  onDrillDown,
}: Pick<HomeProps, 'congress' | 'dashboard' | 'onDrillDown'>) {
  const data = dashboard.topSponsors.slice(0, 10);
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((s) => s.count));
  // Alphabetical, as brand.md lists parties.
  const parties = [...new Map(data.map((s) => partyOf(s.party)).map((p) => [p.label, p])).values()].sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  return (
    <section className="border-b border-line">
      <div className="container-editorial py-16 sm:py-24">
        <SectionHeader
          eyebrow="The most prolific"
          title="Leading sponsors"
          action={
            <SectionAsk
              question={`Who introduces the most bills in the ${formatCongressOrdinal(congress)} Congress, and does that mean anything?`}
            />
          }
        />
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
          {parties.map((p) => (
            <span key={p.label} className="inline-flex items-center gap-2 text-sm text-ink-2">
              <PartyDot party={p.code} />
              {p.label}
            </span>
          ))}
        </div>

        {data.length === 0 ? (
          <p className="mt-8 text-sm text-ink-3">No sponsor data available.</p>
        ) : (
          <ol className="mt-8 border-b border-line" onMouseLeave={() => setHover(null)}>
            {data.map((s, i) => {
              const p = partyOf(s.party);
              return (
                <li key={s.name} className="border-t border-line">
                  <button
                    type="button"
                    onMouseEnter={() => setHover(s.name)}
                    onFocus={() => setHover(s.name)}
                    onClick={() => onDrillDown('sponsor', s.name)}
                    aria-label={`${s.name}, ${p.label}${s.state ? `, ${s.state}` : ''}: ${fmt(s.count)} bills`}
                    className={cn(
                      'focus-ring grid min-h-12 w-full grid-cols-[1.5rem_minmax(0,11rem)_1fr] items-center gap-3 rounded-sm py-2 text-left transition-opacity sm:grid-cols-[2rem_18rem_1fr] sm:gap-4',
                      hover && hover !== s.name && 'opacity-35',
                    )}
                  >
                    <span className="font-mono text-xs text-ink-3 tabular">{i + 1}</span>
                    <PartyTag name={s.name} party={p.code} state={s.state} className="text-[15px]" />
                    <span className="flex items-center gap-3">
                      <span
                        className={cn('h-3 origin-left rounded-r-sm animate-bar-grow', p.fill)}
                        style={{ width: `${(s.count / max) * 88}%`, animationDelay: `${i * 40}ms` }}
                      />
                      <span className="font-mono text-sm text-ink tabular">{fmt(s.count)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-4 font-mono text-xs text-ink-3">
          Bills introduced as sponsor, this Congress. Click a member to see their bills.
        </p>
      </div>
    </section>
  );
}
