'use client';

import { useAnswers } from './answer-provider';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { Arrow } from '@/components/brand/arrow';

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
  children = (
    <>
      Ask about this <Arrow />
    </>
  ),
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
      // touch-hit: a line of text, but a 44px target on a touch screen.
      className={cn(
        'touch-hit text-ink-2 transition-colors hover:text-ink disabled:opacity-50',
        className ?? 'focus-ring whitespace-nowrap rounded-sm text-caption font-medium',
      )}
    >
      {children}
    </button>
  );
}
