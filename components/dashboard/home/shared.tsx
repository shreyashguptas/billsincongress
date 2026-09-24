'use client';

/**
 * Shared pieces for the home page's hero and chart sections: the props
 * contract, a compact Congress picker and the browse link. The hero's ask box is `components/answers/hero-ask.tsx`.
 */

import Link from 'next/link';
import { ArrowUp } from 'lucide-react';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import type { StarterInput } from '@/lib/starter-questions';
import { cn } from '@/lib/utils';
import { formatCongressOrdinal, formatCongressYears } from '@/lib/congress';

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

/** Compact dropdown replacing the row of Congress buttons. */
export function CongressSelect({
  congressNumbers,
  selectedCongress,
  onSelectCongress,
  className,
}: Pick<HomeProps, 'congressNumbers' | 'selectedCongress' | 'onSelectCongress'> & {
  className?: string;
}) {
  return (
    <label className={cn('inline-flex items-center gap-2', className)}>
      <span className="sr-only">Congress</span>
      <select
        value={selectedCongress}
        onChange={(e) => {
          const c = Number(e.target.value);
          analytics.dashboardCongressSelected(c);
          onSelectCongress(c);
        }}
        className="h-8 rounded-sm border border-border bg-background pl-2 pr-7 font-mono text-xs text-foreground hover:border-foreground/40 focus:border-foreground focus:outline-none"
      >
        {[...congressNumbers]
          .sort((a, b) => b - a)
          .map((c) => (
            <option key={c} value={c}>
              {formatCongressOrdinal(c)} · {formatCongressYears(c)}
            </option>
          ))}
      </select>
    </label>
  );
}

export function BrowseLink({ className, label = 'Or browse all bills →' }: { className?: string; label?: string }) {
  return (
    <Link
      href="/bills"
      data-ph-capture-attribute-cta="home-browse-bills"
      className={cn(
        'text-sm text-muted-foreground hover:text-foreground underline underline-offset-2 decoration-border hover:decoration-foreground transition-colors',
        className,
      )}
    >
      {label}
    </Link>
  );
}
