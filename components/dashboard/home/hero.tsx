'use client';

/**
 * The home page hero: the chamber, on the Night stage.
 *
 * The section carries `stage dark`, so every token inside takes its Night
 * value in both themes (documentation/brand.md, "The stage") — the one dark
 * band on the page. Centred. The chart (hemicycle.tsx) is the hero; its hollow
 * holds one big number — laws passed — that swaps to a party's own number on
 * hover. A legend entry also pins its party when clicked or tapped (a touch
 * screen has no hover), as the topic wheel pins a topic. One legend row under the arc carries every party, and the ask box
 * (HeroAsk, with its bill suggestions) sits below it with its starters as
 * pills. Browse sits beside the Congress picker.
 */

import { useRef, useState } from 'react';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal, formatCongressYears } from '@/lib/congress';
import { PartyDot } from '@/components/brand/party';
import { SourceLine } from '@/components/brand/section';
import { Term } from '@/components/brand/term';
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
  const [hoverState, setHoverState] = useState<PartyKey | null>(null);
  const [pinned, setPinned] = useState<PartyKey | null>(null);
  const reported = useRef(new Set<PartyKey>());
  const report = (p: PartyKey) => {
    if (reported.current.has(p)) return;
    reported.current.add(p);
    analytics.homeChamberPartyFocused(p, congress);
  };
  const setHover = (p: PartyKey | null) => {
    setHoverState(p);
    if (p) report(p);
  };
  const togglePin = (p: PartyKey) => {
    const next = pinned === p ? null : p;
    setPinned(next);
    if (next) report(next);
  };
  // What the seats and the well show: the party pointed at, else the pinned one.
  const hover = hoverState ?? pinned;
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
            <BrowseLink label="Browse bills" />
            <CongressSelect {...props} />
          </div>
        </div>

        <h1 className="mt-10 text-center text-[2.375rem] font-medium leading-[1.08] tracking-[-0.02em] text-ink sm:mt-14 sm:text-display-2xl sm:leading-[1.03] sm:tracking-[-0.025em]">
          Who&rsquo;s writing America&rsquo;s laws?
        </h1>
        <p className="mx-auto mt-4 max-w-measure text-center text-[1.0625rem] leading-relaxed text-ink-2">
          {/* The first civics words on the site, each a tap from its meaning. */}
          A congressional bill tracker: every bill and <Term id="resolution">resolution</Term> in the{' '}
          <Term id="congress-number">{formatCongressOrdinal(congress)} Congress</Term>, seated by the party of
          its <Term id="sponsor">sponsor</Term>.
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
          className="mx-auto mt-8 grid max-w-md grid-cols-1 border-b border-line sm:flex sm:max-w-none sm:flex-wrap sm:justify-center sm:gap-x-14 sm:border-0"
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
        >
          {PARTIES.filter((p) => bills[p.key] > 0).map((p) => (
            <button
              key={p.key}
              type="button"
              // Mouse only: a tap's compatibility mouseenter would leave a
              // hover behind that outlives un-pinning.
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(p.key)}
              // Keyboard focus only: a tap focuses the button too, and that
              // hover would outlive un-pinning it with a second tap.
              onFocus={(e) => e.currentTarget.matches(':focus-visible') && setHover(p.key)}
              onBlur={() => setHover(null)}
              onClick={() => togglePin(p.key)}
              aria-pressed={pinned === p.key}
              className={cn(
                // A phone gives each party a full-width row, name then counts,
                // rather than a third of the width, so they fit at any font size.
                'focus-ring flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-sm border-t border-line py-3 text-left transition-opacity sm:block sm:border-0 sm:py-0 sm:text-center touchable:min-h-11',
                hover && hover !== p.key && 'opacity-35',
              )}
            >
              <span className="label-eyebrow flex items-center gap-2 sm:justify-center">
                <PartyDot party={p.key} />
                {p.label}
              </span>
              <span className="meta sm:mt-1.5 sm:block">
                <span>
                  <span className="font-medium text-ink">{fmt(bills[p.key])}</span> filed
                </span>
                <span> · </span>
                <span>
                  <span className="font-medium text-status-law">{fmt(laws[p.key])}</span> {laws[p.key] === 1 ? 'law' : 'laws'}
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
