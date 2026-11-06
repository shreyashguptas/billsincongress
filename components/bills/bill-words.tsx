'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WordList } from '@/components/brand/word-list';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import type { TermId } from '@/lib/glossary';

/**
 * "Words to know" at the foot of a bill page (documentation/brand.md, "Words
 * to know"): the civics words this page used, in plain text, its own kind of
 * measure first, at most nine (`billPageWords` in lib/glossary.ts). It is the
 * fallback for the dotted `<Term>` popovers: a screen reader, a printout and a
 * reader who never taps still meet every definition the page leaned on.
 *
 * On a phone the list starts folded under one button, so it does not add a
 * screen of text to the end of every bill; from `sm` up, and in print, it is
 * always open.
 */
export function BillWords({ billId, ids }: { billId: string; ids: readonly TermId[] }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  if (ids.length === 0) return null;
  return (
    <section aria-labelledby="bill-words-title" className="container-editorial pb-16 sm:pb-20">
      <div className="border-t border-line pt-12 sm:pt-16">
        <p className="label-eyebrow">Words to know</p>
        <h2 id="bill-words-title" className="mt-3 text-display-sm text-ink sm:text-display-md">
          The words on this page, in plain English
        </h2>

        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => {
            if (!open) analytics.billWordsExpanded({ bill_id: billId, words: ids.length });
            setOpen(!open);
          }}
          className="mt-6 w-full sm:hidden print:hidden"
        >
          {open ? 'Hide the words' : `Show the words (${ids.length})`}
          <ChevronDown
            className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', open && 'rotate-180')}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Button>

        <div id={listId} className={cn('mt-6 sm:mt-8 sm:block print:block', !open && 'hidden')}>
          <WordList ids={ids} className="md:grid md:grid-cols-2 md:gap-x-12 lg:grid-cols-3" />
          <Link
            href="/learn#words"
            data-ph-capture-attribute-cta="bill-words-all-in-learn"
            className="focus-ring touch-hit mt-6 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
          >
            Every word, in Learn
            <ArrowRight className="h-4 w-4 text-ink-3" strokeWidth={1.75} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
