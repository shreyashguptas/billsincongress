'use client';

import { useAnswers } from './answer-provider';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';

/**
 * The "ask about this" affordance beside a chart (spec §6.5).
 *
 * This is what makes "evidence below" coherent rather than demoted — the
 * dashboard stops being a dead end and starts producing the next question.
 * Sits alongside the existing drill-down, never replacing it: browse and ask
 * are different intents.
 */
export function AskAbout({
  question,
  className,
  children = 'Ask about this →',
}: {
  question: string;
  /** Replaces the default small-caption styling, e.g. for an inline action. */
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
        'text-ink-2 transition-colors hover:text-ink disabled:opacity-50',
        className ?? 'focus-ring whitespace-nowrap rounded-sm text-[13px] font-medium',
      )}
    >
      {children}
    </button>
  );
}
