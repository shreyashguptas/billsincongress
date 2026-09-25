'use client';

/**
 * The home page hero: the chamber.
 *
 * Centred. The chart (hemicycle.tsx) is the hero; its hollow holds one big
 * number — laws passed — that swaps to a party's own number on hover. One
 * legend row under the arc carries every party, and the ask box (HeroAsk, with
 * its bill suggestions) sits below it, centred, with its starters as pills.
 * Browse sits beside the Congress picker.
 */

import { useRef, useState } from 'react';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal, formatCongressYears } from '@/lib/congress';
import { Hemicycle, HemicycleKey, PARTIES, WellReadout, type PartyKey } from './hemicycle';
import { HeroAsk } from '@/components/answers/hero-ask';
import { BrowseLink, CongressSelect, combinedParty, fmt, type HomeProps } from './shared';

export function HomeHero(props: HomeProps) {
  const { congress, house, senate, starterInput } = props;
  // Each chamber's party breakdown is its own row, written after the stats.
  // If one exists and the other doesn't yet, the seats would hold about half
  // the bills under a headline about all of them, so show neither until both
  // are there (Hemicycle renders its "not built yet" note for all-zero counts).
  const breakdownComplete =
    ((house?.total ?? 0) > 0 || props.dashboard.houseCount === 0) &&
    ((senate?.total ?? 0) > 0 || props.dashboard.senateCount === 0);
  const { bills, laws } = breakdownComplete
    ? combinedParty(house, senate)
    : combinedParty(null, null);
  const [hover, setHoverState] = useState<PartyKey | null>(null);
  const reported = useRef(new Set<PartyKey>());
  const setHover = (p: PartyKey | null) => {
    setHoverState(p);
    if (p && !reported.current.has(p)) {
      reported.current.add(p);
      analytics.homeChamberPartyFocused(p, congress);
    }
  };
  const totalBills = PARTIES.reduce((s, p) => s + bills[p.key], 0);
  const totalLaws = PARTIES.reduce((s, p) => s + laws[p.key], 0);

  return (
    <section className="border-b border-border">
      <div className="container-editorial py-8 sm:py-12">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="label-eyebrow">
            The {formatCongressOrdinal(congress)} Congress · {formatCongressYears(congress)}
          </p>
          <div className="flex items-center gap-4">
            <BrowseLink label="Browse bills →" className="no-underline" />
            <CongressSelect {...props} />
          </div>
        </div>

        <h1 className="mt-4 text-center font-serif text-display-md sm:text-display-lg font-semibold tracking-tight">
          Who&rsquo;s writing America&rsquo;s laws?
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Every bill in the {formatCongressOrdinal(congress)} Congress, sourced from Congress.gov.
        </p>

        <div className="mx-auto mt-2 max-w-2xl">
          <Hemicycle
            bills={bills}
            laws={laws}
            hover={hover}
            onHover={setHover}
            well={<WellReadout hover={hover} bills={bills} laws={laws} />}
          />
        </div>

        {/* One legend row: every party, same place, hover-linked to the seats. */}
        <div className="mt-5 flex flex-wrap justify-center gap-x-8 gap-y-3" onMouseLeave={() => setHover(null)}>
          {PARTIES.filter((p) => bills[p.key] > 0).map((p) => (
            <button
              key={p.key}
              type="button"
              onMouseEnter={() => setHover(p.key)}
              onFocus={() => setHover(p.key)}
              onBlur={() => setHover(null)}
              className={cn('text-left transition-opacity', hover && hover !== p.key && 'opacity-35')}
            >
              <span className="flex items-center gap-1.5 label-eyebrow">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
                {p.label}
              </span>
              <span className="mt-0.5 block text-sm">
                <span className="font-mono tabular">{fmt(bills[p.key])}</span>
                <span className="text-muted-foreground"> bills · </span>
                <span className="font-mono tabular" style={{ color: 'hsl(var(--status-law))' }}>{fmt(laws[p.key])}</span>
                <span className="text-muted-foreground"> laws</span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-center">
          <HemicycleKey totalBills={totalBills} totalLaws={totalLaws} />
        </div>

        <HeroAsk starters={starterInput} centered />
      </div>
    </section>
  );
}
