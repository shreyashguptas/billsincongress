'use client';

import { MessageSquare } from 'lucide-react';
import { useAnswers } from '@/components/answers/answer-provider';
import { Button } from '@/components/ui/button';
import { analytics } from '@/lib/analytics';

/**
 * The bill page's ask affordance (spec §6.4): the "Ask the record" band's
 * contents — the invitation and one ink button on the left, the starter
 * questions as pills on the right.
 *
 * The page no longer hosts its own thread. It opens the persistent panel
 * instead, so a reader who follows a bill card out of an answer and back again
 * keeps one conversation rather than starting a second one here.
 *
 * `focusBillId` is derived from the URL inside the provider, so "this bill"
 * resolves without this component passing it — and keeps resolving correctly
 * after the reader navigates to a different bill.
 */
export function AskAboutBill({
  title,
  noun,
  headingId,
}: {
  title: string;
  noun: string;
  /** Lets the surrounding band name itself after this heading. */
  headingId?: string;
}) {
  const { ask, setOpen, busy } = useAnswers();

  // `noun` rather than a hardcoded "bill": on an H.Res. page the heading above
  // already reads "resolution", and a starter that asks about "this bill" both
  // contradicts it and puts the wrong word into the question the reader sends.
  const starters = [
    `What does this ${noun} actually do?`,
    'Where does it stand right now, and what happens next?',
    'Who wrote it, and what else have they introduced?',
  ];

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_520px] lg:items-center lg:gap-16">
      <div>
        <p className="label-eyebrow">Ask the record</p>
        <h2 id={headingId} className="mt-3 text-display-sm text-ink sm:text-display-md">
          Have a question about this {noun}?
        </h2>
        <p className="mt-3 max-w-[46ch] text-base leading-relaxed text-ink-2">
          Every answer cites the records it came from, and the conversation follows you as you
          read.
        </p>
        <Button
          type="button"
          size="lg"
          disabled={busy}
          onClick={() => setOpen(true, 'bill_page')}
          className="mt-7"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Ask about this {noun}
        </Button>
      </div>

      <ul className="flex flex-col items-start gap-2.5" aria-label="Suggested questions">
        {starters.map((q) => (
          <li key={q} className="max-w-full">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                analytics.answerStarterClicked({ surface: 'bill', starter_text: q });
                void ask(q, { source: 'starter' });
              }}
              className="focus-ring inline-flex min-h-11 max-w-full items-center rounded-full border border-line-strong bg-raised px-5 py-2.5 text-left text-[15px] leading-snug text-ink-2 transition-colors hover:bg-paper hover:text-ink disabled:opacity-50"
            >
              {q}
            </button>
          </li>
        ))}
      </ul>
      <p className="sr-only">Questions about {title} are answered in the ask panel.</p>
    </div>
  );
}
