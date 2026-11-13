'use client';

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { stageFill } from '@/components/brand/status';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { getTerm, termHref, termify, type TermId } from '@/lib/glossary';

/**
 * A civics word with its plain meaning one tap away (documentation/brand.md,
 * "Term"). The word keeps the type of the sentence it sits in and gains a
 * dotted `ink-3` underline; a tap, a click, or Enter/Space opens a popover
 * with the definition from `lib/glossary.ts` and a link to the word on the
 * Learn page. Never hover-only: a phone cannot hover, and a definition that
 * appears as the pointer crosses a headline is noise.
 *
 * Use it the first time a word appears on a page, not every time.
 *
 * The trigger is an inline `<span role="button">`, not a `<button>`: a button
 * is an unbreakable inline block, so a long word wrapped as a whole and the
 * full stop after it fell to the next line on its own ("committee / . Here").
 * The span flows like the text it is part of; Enter and Space open it as a
 * button would. It must not sit inside a link or another control.
 *
 * Its tap area is its own line (`.term-hit`, app/globals.css): a word in a
 * sentence is an inline target, and the 44px `.touch-hit` box it once had, on
 * a 26px line, reached into the next line, so a tap on "119th Congress" in the
 * home hero opened "Sponsor". `standalone` is for a Term that is the whole of
 * its label and the only target on its line (a stage's name, the bill number):
 * that one grows to 44px tall on touch (`.term-hit-solo`).
 *
 * The popover is portaled to the end of <body>, so on its own the keyboard
 * would leave it for the browser chrome (Tab) or skip the word (Shift+Tab).
 * Tab from its last link closes it and moves on to whatever follows the word;
 * Shift+Tab from its top closes it and returns to the word.
 */
export function Term({
  id,
  children,
  className,
  standalone = false,
}: {
  id: TermId;
  /** The words as they read in the sentence. Defaults to the dictionary word. */
  children?: ReactNode;
  className?: string;
  /** The whole of its label, alone on its line: a 44px target on touch. */
  standalone?: boolean;
}) {
  const entry = getTerm(id);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const titleId = useId();
  const descId = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  // Where Tab was headed when it closed the popover; read as it closes.
  const leaveTo = useRef<HTMLElement | null>(null);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) analytics.termOpened({ term: id, path: pathname ?? '' });
  };

  const onContentKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const trigger = triggerRef.current;
    if (e.key !== 'Tab' || !trigger) return;
    const content = e.currentTarget;
    const inside = tabbables(content);
    const at = document.activeElement;
    const leaving = e.shiftKey
      ? at === content || at === inside[0]
      : inside.length === 0 || at === inside[inside.length - 1];
    if (!leaving) return;
    e.preventDefault();
    leaveTo.current = e.shiftKey ? trigger : tabbableAfter(trigger, content);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span
          ref={triggerRef}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.currentTarget.click();
            }
          }}
          className={cn(
            // Focus scrolls it clear of the sticky header, so its popover has an anchor.
            standalone ? 'term-hit-solo' : 'term-hit',
            'focus-ring cursor-pointer scroll-my-24 rounded-xs',
            'underline decoration-ink-3 decoration-dotted decoration-[1.5px] underline-offset-[0.2em]',
            'transition-colors hover:decoration-ink data-[state=open]:decoration-ink data-[state=open]:decoration-solid',
            className,
          )}
        >
          {children ?? entry.word}
        </span>
      </PopoverTrigger>
      <PopoverContent
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onContentKeyDown}
        // Radix returns focus to the word as it closes; a Tab out goes on instead.
        onCloseAutoFocus={(e) => {
          const next = leaveTo.current;
          leaveTo.current = null;
          if (next && next !== triggerRef.current) {
            e.preventDefault();
            next.focus();
          }
        }}
        // Below the word where there is room, above it otherwise (Radix flips).
        side="bottom"
        className="w-[min(320px,calc(100vw-24px))] p-0 font-sans normal-case tracking-normal"
      >
        <div className="px-4 pb-3.5 pt-4">
          <p id={titleId} className="flex items-center gap-2 font-serif text-title font-medium text-ink">
            {entry.stage !== undefined && (
              <span aria-hidden="true" className={cn('h-2.5 w-2.5 shrink-0 rounded-full', stageFill(entry.stage))} />
            )}
            {entry.word}
          </p>
          <p id={descId} className="mt-1.5 text-ui leading-6 text-ink-2">{entry.definition}</p>
        </div>
        <div className="border-t border-line px-4 py-2.5">
          <Link
            href={termHref(id)}
            onClick={() => setOpen(false)}
            data-ph-capture-attribute-cta="term-more-in-learn"
            className="focus-ring flex min-h-8 w-fit items-center gap-1.5 rounded-xs text-sm font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink touchable:min-h-11"
          >
            More words in Learn
            <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), ' +
  'textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/** What Tab can reach inside `root`, in document order. */
function tabbables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      el.getClientRects().length > 0 &&
      getComputedStyle(el).visibility !== 'hidden' &&
      !el.closest('[inert]'),
  );
}

/** The first thing Tab would reach after `trigger`, outside the popover. */
function tabbableAfter(trigger: HTMLElement, popover: HTMLElement): HTMLElement | null {
  return (
    tabbables(document).find(
      (el) =>
        !popover.contains(el) &&
        !trigger.contains(el) &&
        Boolean(trigger.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
    ) ?? null
  );
}

/**
 * A sentence held as a string, with the first appearance of each listed word
 * made a `<Term>` (`termify` in lib/glossary.ts). Every piece is its own
 * element, so a translated page cannot trip React over a bare text node.
 */
export function TermText({ text, terms }: { text: string; terms: TermId[] }) {
  return (
    <>
      {termify(text, terms).map((piece, i) =>
        typeof piece === 'string' ? (
          <span key={i}>{piece}</span>
        ) : (
          <Term key={i} id={piece.id}>
            {piece.text}
          </Term>
        ),
      )}
    </>
  );
}
