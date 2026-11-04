'use client';

import { useAnswers } from './answer-provider';
import { analytics } from '@/lib/analytics';
import type { AnswerScope } from '@/lib/answer-scope';
import { Button } from '@/components/ui/button';
import { Arrow } from '@/components/brand/arrow';

/**
 * The ask bar on a filtered list (spec §6.3).
 *
 * The highest-intent surface on the site: the reader has already said exactly
 * what they care about and is looking at more rows than they want to read. The
 * scope is handed over pre-applied, so the answer is about THIS set — not a set
 * the model re-derived and got slightly wrong.
 */
export function ScopeAskBar({ scope, count }: { scope: AnswerScope | null; count: number }) {
  const { ask, busy } = useAnswers();
  if (!scope || count === 0) return null;

  const question = `What do these ${scope.label} have in common, and which matter most?`;

  return (
    <Button
      type="button"
      variant="link"
      disabled={busy}
      onClick={() => {
        analytics.answerStarterClicked({ surface: 'filtered', starter_text: question });
        void ask(question, { source: 'starter', scope });
      }}
      className="rounded-sm text-caption decoration-1"
    >
      {/* One span: Button is a flex box, which would drop the space before the arrow. */}
      <span>
        Ask about these <Arrow />
      </span>
    </Button>
  );
}
