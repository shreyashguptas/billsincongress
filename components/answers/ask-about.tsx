'use client';

import { useAnswers } from './answer-provider';
import { analytics } from '@/lib/analytics';

/**
 * The "ask about this" affordance beside a chart (spec §6.5).
 *
 * This is what makes "evidence below" coherent rather than demoted — the
 * dashboard stops being a dead end and starts producing the next question.
 * Sits alongside the existing drill-down, never replacing it: browse and ask
 * are different intents.
 */
export function AskAbout({ question }: { question: string }) {
  const { ask, busy } = useAnswers();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        analytics.answerStarterClicked({ surface: 'home', starter_text: question });
        void ask(question, { source: 'starter' });
      }}
      className="text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 whitespace-nowrap"
    >
      Ask about this →
    </button>
  );
}
