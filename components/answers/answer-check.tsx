'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AnswerVerdict } from '@/lib/answer-rating';

/**
 * "Was this answer right?" (brand.md, "Patterns": Answer check).
 *
 * Every wrong answer found so far was found by us. This is the reader's way to
 * say so. It sits under the sources, quiet, and asks once: after a tap the two
 * buttons give way to one line, and the answer cannot be rated again.
 *
 * What each tap sends, and why a "yes" sends less, is in lib/answer-rating.ts.
 */
export function AnswerCheck({
  rating,
  onRate,
  className,
}: {
  rating?: AnswerVerdict;
  onRate: (verdict: AnswerVerdict) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex min-h-8 flex-wrap items-center gap-x-3 gap-y-2', className)}>
      {/* One live region for both states, so a screen reader hears the thanks
          in place of the question it just answered. */}
      <p aria-live="polite" className="text-[13px] leading-5 text-ink-3">
        {rating === 'wrong'
          ? 'Thanks. We will check this answer against the records.'
          : rating === 'right'
            ? 'Thanks for checking.'
            : 'Was this answer right?'}
      </p>
      {!rating && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="touchable:h-11 touchable:px-4"
            aria-label="Yes, this answer was right"
            onClick={() => onRate('right')}
          >
            Yes
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="touchable:h-11 touchable:px-4"
            aria-label="No, this answer was wrong"
            onClick={() => onRate('wrong')}
          >
            No
          </Button>
        </div>
      )}
    </div>
  );
}
