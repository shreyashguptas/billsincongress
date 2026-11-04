import { stageFill } from '@/components/brand/status';
import { cn } from '@/lib/utils';
import { TERMS, type TermId } from '@/lib/glossary';

/**
 * Civics words as plain, always-visible text (documentation/brand.md, "Words
 * to know"): a hairline-ruled definition list, the word in Newsreader with its
 * stage dot when it names a stage, its meaning under it in `ink-2`. No control
 * and no popover, so it reads the same to a screen reader, on paper and to a
 * reader who never taps a dotted word.
 *
 * `anchors` gives each row the id a `<Term>` popover's link lands on
 * (`/learn#word-committee`); the row landed on is filled `sunken` (Learn's
 * `<WordTarget>` sets its `data-target`).
 */
export function WordList({
  ids,
  anchors = false,
  className,
}: {
  ids: readonly TermId[];
  anchors?: boolean;
  className?: string;
}) {
  return (
    <dl className={cn('border-b border-line', className)}>
      {ids.map((id) => {
        const entry = TERMS[id];
        const stage = 'stage' in entry ? entry.stage : undefined;
        return (
          <div
            key={id}
            id={anchors ? `word-${id}` : undefined}
            className={cn(
              'break-inside-avoid border-t border-line py-4',
              // The fill reaches 12px past the text on each side while the
              // hairlines stay put.
              anchors &&
                'scroll-mt-24 transition-colors data-[target]:bg-sunken data-[target]:shadow-[-12px_0_0_hsl(var(--sunken)),12px_0_0_hsl(var(--sunken))]',
            )}
          >
            <dt className="flex items-center gap-2.5 font-serif text-title font-medium text-ink">
              {stage !== undefined && (
                <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', stageFill(stage))} />
              )}
              {entry.word}
            </dt>
            <dd className="mt-1 text-base leading-relaxed text-ink-2">{entry.definition}</dd>
          </div>
        );
      })}
    </dl>
  );
}
