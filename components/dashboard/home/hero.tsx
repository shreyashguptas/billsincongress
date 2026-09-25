'use client';

/**
 * The home page hero: the chamber, on the Night stage.
 *
 * The section carries `stage dark`, so every token inside takes its Night
 * value in both themes (Documentation/brand.md, "The stage") — the one dark
 * band on the page. Centred. The chart (hemicycle.tsx) is the hero; its hollow
 * holds one big number — laws passed — that swaps to a party's own number on
 * hover. One legend row under the arc carries every party, and the ask box
 * (HeroAsk, with its bill suggestions) sits below it with its starters as
 * pills. Browse sits beside the Congress picker.
 */

import { useRef, useState } from 'react';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal, formatCongressYears } from '@/lib/congress';
import { PartyDot } from '@/components/brand/party';
import { SourceLine } from '@/components/brand/section';
import { HeroAsk } from '@/components/answers/hero-ask';
import { Hemicycle, HemicycleKey, PARTIES, WellReadout, type PartyKey } from './hemicycle';
import { BrowseLink, CongressSelect, combinedParty, fmt, type HomeProps } from './shared';

// UTC so the server and the browser print the same day.
const updatedFormat = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function HomeHero(props: HomeProps) {
  const { congress, house, senate, allCongress, starterInput } = props;
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
  // When this Congress's counts were last rebuilt from the synced bills.
  const updatedAt = allCongress.find((c) => c.congress === congress)?.updatedAt;

  return (
    <section className="stage dark border-b border-line">
      <div className="container-editorial pb-16 pt-6 sm:pb-24 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className="label-eyebrow">
            The {formatCongressOrdinal(congress)} Congress · {formatCongressYears(congress)}
          </p>
          <div className="flex items-center gap-5">
            <BrowseLink label="Browse bills →" />
            <CongressSelect {...props} />
          </div>
        </div>

        <h1 className="mt-10 text-center text-[38px] font-medium leading-[1.08] tracking-[-0.02em] text-ink sm:mt-14 sm:text-display-2xl">
          Who&rsquo;s writing America&rsquo;s laws?
        </h1>
        <p className="mx-auto mt-4 max-w-measure text-center text-[17px] leading-relaxed text-ink-2">
          Every bill in the {formatCongressOrdinal(congress)} Congress, seated by the party of its sponsor.
        </p>

        <div className="mx-auto mt-8 max-w-[900px] sm:mt-10">
          <Hemicycle
            bills={bills}
            laws={laws}
            hover={hover}
            onHover={setHover}
            well={<WellReadout hover={hover} bills={bills} laws={laws} />}
          />
        </div>

        {/* One legend row: every party, same place, hover-linked to the seats. */}
        <div
          className="mx-auto mt-8 grid max-w-md grid-cols-3 gap-x-3 gap-y-5 sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-x-14"
          onMouseLeave={() => setHover(null)}
        >
          {PARTIES.filter((p) => bills[p.key] > 0).map((p) => (
            <button
              key={p.key}
              type="button"
              onMouseEnter={() => setHover(p.key)}
              onFocus={() => setHover(p.key)}
              onBlur={() => setHover(null)}
              className={cn(
                'focus-ring rounded-sm text-left transition-opacity sm:text-center',
                hover && hover !== p.key && 'opacity-35',
              )}
            >
              {/* Eyebrow tracking eases on a phone so "Independents" fits a third of the width. */}
              <span className="label-eyebrow flex items-center gap-1.5 tracking-[0.06em] text-ink-2 sm:justify-center sm:gap-2 sm:tracking-[0.14em]">
                <PartyDot party={p.key} />
                {p.label}
              </span>
              <span className="mt-1.5 flex flex-col font-mono text-[13px] leading-5 text-ink-2 tabular sm:block">
                <span>
                  <span className="text-ink">{fmt(bills[p.key])}</span> bills
                </span>
                <span className="hidden sm:inline"> · </span>
                <span>
                  <span className="text-status-law">{fmt(laws[p.key])}</span> {laws[p.key] === 1 ? 'law' : 'laws'}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className="mt-6">
          <HemicycleKey totalBills={totalBills} totalLaws={totalLaws} />
        </div>

        <HeroAsk starters={starterInput} />

        {updatedAt && (
          <SourceLine className="mt-10 text-center">
            Source: Congress.gov · Updated {updatedFormat.format(new Date(updatedAt))}
          </SourceLine>
        )}
      </div>
    </section>
  );
}
