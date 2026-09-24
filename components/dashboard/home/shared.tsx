'use client';

/**
 * Shared pieces for the home page's hero and chart sections: the props
 * contract, a compact Congress picker, the one-line ask field and starters.
 */

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUp } from 'lucide-react';
import type { FunctionReturnType } from 'convex/server';
import type { api } from '@/convex/_generated/api';
import { useAnswers } from '@/components/answers/answer-provider';
import { analytics } from '@/lib/analytics';
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
  starters: string[];
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

/** One-line ask field. `size="lg"` is the taller, emphasised version. */
export function AskField({
  placeholder = 'Ask about any bill in Congress…',
  size = 'md',
  className,
}: {
  placeholder?: string;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const { ask, busy } = useAnswers();
  const [input, setInput] = useState('');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const q = input;
        setInput('');
        void ask(q, { source: 'typed' });
      }}
      className={cn(
        'flex items-center gap-2 border border-border rounded-sm bg-background focus-within:border-foreground transition-colors',
        size === 'lg' && 'shadow-[0_1px_0_0_hsl(var(--border)),0_12px_40px_-20px_hsl(var(--foreground)/0.35)]',
        className,
      )}
    >
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={placeholder}
        aria-label="Ask about any bill in Congress"
        maxLength={2000}
        disabled={busy}
        className={cn(
          'flex-1 min-w-0 bg-transparent border-0 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/70',
          size === 'lg' ? 'h-14 px-5 text-lg' : 'h-12 px-4 text-base',
        )}
      />
      <button
        type="submit"
        disabled={busy || !input.trim()}
        aria-label="Ask"
        className={cn(
          'inline-flex items-center justify-center rounded-sm bg-foreground text-background hover:bg-foreground/85 transition-colors disabled:opacity-40 shrink-0',
          size === 'lg' ? 'mr-2 h-10 w-10' : 'mr-1.5 h-9 w-9',
        )}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </form>
  );
}

/** A starter question as a quiet button. */
export function StarterButton({
  question,
  className,
  children,
}: {
  question: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const { ask, busy } = useAnswers();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        analytics.answerStarterClicked({ surface: 'home', starter_text: question });
        void ask(question, { source: 'starter' });
      }}
      className={cn(
        'text-left text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50',
        className,
      )}
    >
      {children ?? (
        <>
          <span className="text-muted-foreground/60 mr-1.5" aria-hidden="true">▸</span>
          {question}
        </>
      )}
    </button>
  );
}

/** Starters as small pills in one wrapping row — far less text than a list. */
export function StarterChips({ questions, className }: { questions: string[]; className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {questions.map((q) => (
        <StarterButton
          key={q}
          question={q}
          className="rounded-full border border-border px-3 py-1 text-xs hover:border-foreground/40"
        >
          {q}
        </StarterButton>
      ))}
    </div>
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
