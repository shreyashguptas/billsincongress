'use client';

import { useAnswers } from '@/components/answers/answer-provider';
import { analytics } from '@/lib/analytics';

/**
 * The bill page's ask affordance (spec §6.4).
 *
 * The page no longer hosts its own thread. It opens the persistent panel
 * instead, so a reader who follows a bill card out of an answer and back again
 * keeps one conversation rather than starting a second one here.
 *
 * `focusBillId` is derived from the URL inside the provider, so "this bill"
 * resolves without this component passing it — and keeps resolving correctly
 * after the reader navigates to a different bill.
 */
export function AskAboutBill({ title, noun }: { title: string; noun: string }) {
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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(true, 'bill_page')}
          className="inline-flex items-center gap-2 rounded-sm bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:bg-foreground/85 transition-colors disabled:opacity-50"
        >
          Ask about this {noun}
        </button>
      </div>
      <div className="flex flex-col gap-1.5 items-start pt-1">
        {starters.map((q) => (
          <button
            key={q}
            type="button"
            disabled={busy}
            onClick={() => {
              analytics.answerStarterClicked({ surface: 'bill', starter_text: q });
              void ask(q, { source: 'starter' });
            }}
            className="text-left text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <span className="text-muted-foreground/60 mr-1.5" aria-hidden="true">
              ▸
            </span>
            {q}
          </button>
        ))}
      </div>
      <p className="sr-only">Questions about {title} are answered in the ask panel.</p>
    </div>
  );
}
