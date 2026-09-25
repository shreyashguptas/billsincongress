'use client';

/**
 * Shared pieces for the home page's hero and chart sections: the props
 * contract, a compact Congress picker, the browse link and the "Ask about
 * this" action each section header carries. The hero's ask box is
 * `components/answers/hero-ask.tsx`.
 */

import Link from 'next/link';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import type { StarterInput } from '@/lib/starter-questions';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal, formatCongressYears } from '@/lib/congress';
import { AskAbout } from '@/components/answers/ask-about';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Dashboard = NonNullable<FunctionReturnType<typeof api.bills.getCongressDashboard>>;
type Breakdown = FunctionReturnType<typeof api.bills.getChamberDeepBreakdown>;
type Overview = FunctionReturnType<typeof api.bills.getAllCongressOverview>;

export interface HomeProps {
  /** The Congress whose numbers are on screen. */
  congress: number;
  dashboard: Dashboard;
  house: Breakdown | null | undefined;
  senate: Breakdown | null | undefined;
  allCongress: Overview;
  congressNumbers: number[];
  selectedCongress: number;
  onSelectCongress: (congress: number) => void;
  onDrillDown: (filterType: string, filterValue: string | number) => void;
  policyAreaHref: (area: string) => string;
  /** Feeds the hero's ask box starters (`lib/starter-questions.ts`). */
  starterInput: StarterInput;
}

export const fmt = (n: number) => n.toLocaleString('en-US');

/** Both chambers' party counts added together. */
export function combinedParty(house: Breakdown | null | undefined, senate: Breakdown | null | undefined) {
  const keys = ['D', 'R', 'I', 'U'] as const;
  const bills = Object.fromEntries(
    keys.map((k) => [k, (house?.partyCounts[k] ?? 0) + (senate?.partyCounts[k] ?? 0)]),
  ) as Record<(typeof keys)[number], number>;
  const laws = Object.fromEntries(
    keys.map((k) => [k, (house?.partyLawCounts[k] ?? 0) + (senate?.partyLawCounts[k] ?? 0)]),
  ) as Record<(typeof keys)[number], number>;
  return { bills, laws };
}

/**
 * Compact Congress picker on the hero's Night stage. The list portals to
 * <body>, outside the stage, so it carries `dark` itself to stay in Night.
 */
export function CongressSelect({
  congressNumbers,
  selectedCongress,
  onSelectCongress,
  className,
}: Pick<HomeProps, 'congressNumbers' | 'selectedCongress' | 'onSelectCongress'> & {
  className?: string;
}) {
  return (
    <Select
      value={String(selectedCongress)}
      onValueChange={(value) => {
        const c = Number(value);
        analytics.dashboardCongressSelected(c);
        onSelectCongress(c);
      }}
    >
      <SelectTrigger
        aria-label="Congress"
        className={cn(
          'h-9 w-auto gap-1 border-line-strong bg-transparent py-0 pl-3 pr-3 font-mono text-[13px] text-ink hover:border-ink data-[state=open]:border-ink touchable:h-11',
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="dark">
        {[...congressNumbers]
          .sort((a, b) => b - a)
          .map((c) => (
            <SelectItem key={c} value={String(c)} className="font-mono text-[13px]">
              {formatCongressOrdinal(c)} · {formatCongressYears(c)}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}

export function BrowseLink({ className, label = 'Or browse all bills →' }: { className?: string; label?: string }) {
  return (
    <Link
      href="/bills"
      data-ph-capture-attribute-cta="home-browse-bills"
      className={cn(
        'link focus-ring rounded-sm text-sm',
        className,
      )}
    >
      {label}
    </Link>
  );
}

/**
 * A section header's one action (brand.md, "SectionHeader"): hands the reader
 * the section's own question. Sits beside the drill-downs, never replaces them.
 */
export function SectionAsk({ question }: { question: string }) {
  return (
    <AskAbout question={question} className="focus-ring whitespace-nowrap rounded-sm text-sm font-medium">
      Ask about this →
    </AskAbout>
  );
}
