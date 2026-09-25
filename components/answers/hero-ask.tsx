'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUp } from 'lucide-react';
import { useAnswers } from './answer-provider';
import { useBillSuggestions } from './use-bill-suggestions';
import { analytics } from '@/lib/analytics';
import { starters as buildStarters, type StarterInput } from '@/lib/starter-questions';
import { initialHighlight, isSettled, moveHighlight } from '@/lib/bill-suggest';
import { buildFilterQuery } from '@/lib/bills/filter-url';
import { DEFAULT_FILTER_VALUES } from '@/app/bills/filter-signature';
import { formatCongressOrdinal } from '@/lib/congress';
import { compactStageLabel } from '@/lib/utils/bill-stages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Starter questions: rounded-full outline pills (brand.md, "Ask composer"),
// on the page rather than raised. Inline-block and wrapping, so a long starter
// breaks like text instead of squeezing into Button's single line.
const PILL =
  'inline-block h-auto whitespace-normal rounded-full border-line bg-transparent px-4 py-2 text-center font-normal leading-5 text-ink-2 hover:border-line-strong hover:bg-transparent hover:text-ink touchable:h-auto touchable:py-3';

/**
 * The home hero's ask box (spec §6.1), centred under the chamber.
 *
 * Deliberately NOT a chat bubble: the ask composer (brand.md) — one raised
 * field with an ink send button — and the generated starters beneath it as a
 * wrapping row of pills. The conversation itself belongs to the panel, so
 * submitting here just calls ask() and the panel takes over. The data starters open the page that answers
 * them rather than asking (`lib/starter-questions.ts` has why); only the
 * cold-start fallbacks are asked.
 *
 * While the reader types, matching bills appear beneath the field
 * (`lib/bill-suggest.ts` has the numbers behind this). Picking one opens the
 * bill; Enter with nothing highlighted still asks the question as typed.
 */
export function HeroAsk({ starters }: { starters: StarterInput }) {
  const { ask, busy } = useAnswers();
  const router = useRouter();
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const starterItems = buildStarters(starters);
  const congress = starters.congress;
  const listId = useId();

  const suggestions = useBillSuggestions(input, congress);
  const settled = suggestions.kind !== null && isSettled(suggestions, input, congress);
  // While the next query is in flight the previous rows stay up, so the list
  // does not blink on every keystroke. They cannot be picked with Enter until
  // they belong to what is typed. Rows from another Congress are never kept:
  // after a switch they would be clickable under the wrong Congress.
  const bills = suggestions.forCongress === congress ? suggestions.bills : [];
  const showList =
    open && !busy && suggestions.kind !== null && (settled || bills.length > 0);
  const active = settled ? highlight : -1;

  // A new settled result set resets the highlight, and is reported once —
  // only while the list is actually open, so "shown" means seen.
  const reported = useRef('');
  useEffect(() => {
    if (!settled || suggestions.kind === null) return;
    setHighlight(initialHighlight(suggestions.kind, suggestions.bills.length));
    if (!open || busy) return;
    const reportKey = `${suggestions.forCongress}:${suggestions.forQuery}`;
    if (reported.current === reportKey) return;
    reported.current = reportKey;
    analytics.billSuggestionsShown({
      match_kind: suggestions.kind,
      query_length: suggestions.forQuery.length,
      result_count: suggestions.bills.length,
      congress,
    });
  }, [settled, open, busy, suggestions.kind, suggestions.forQuery, suggestions.forCongress, suggestions.bills, congress]);

  const trackOpen = (position: number, method: 'click' | 'enter') => {
    const bill = bills[position];
    if (!bill || suggestions.kind === null) return;
    analytics.billSuggestionClicked({
      bill_id: String(bill.id),
      position: position + 1,
      method,
      match_kind: suggestions.kind,
      query_length: suggestions.forQuery.length,
    });
  };

  const askTyped = () => {
    const q = input;
    setInput('');
    setOpen(false);
    void ask(q, { source: 'typed' });
  };

  const seeAllHref =
    '/bills' +
    buildFilterQuery({ ...DEFAULT_FILTER_VALUES, title: input.trim(), congress: String(congress) });

  return (
    <div className="mx-auto mt-10 max-w-[760px]">
      <div className="relative">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (showList && settled && highlight >= 0 && bills[highlight]) {
              trackOpen(highlight, 'enter');
              setOpen(false);
              router.push(`/bills/${bills[highlight].id}`);
              return;
            }
            askTyped();
          }}
          className="flex h-[60px] items-center gap-2 rounded-lg border border-line-strong bg-raised pr-2.5 transition-colors focus-within:border-ink focus-within:ring-1 focus-within:ring-ink"
        >
          <Input
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                return;
              }
              if (!showList || !settled || bills.length === 0) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlight((h) => moveHighlight(h, e.key === 'ArrowDown' ? 1 : -1, bills.length));
              }
            }}
            placeholder="Ask about any bill in Congress…"
            aria-label="Ask about any bill in Congress"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={listId}
            aria-activedescendant={
              showList && active >= 0 ? `${listId}-${active}` : undefined
            }
            autoComplete="off"
            maxLength={2000}
            disabled={busy}
            // Bare: the form draws the edge and the focus treatment.
            className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent px-5 text-[17px] focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-100 touchable:h-full"
          />
          <Button
            // `type="button"`, not submit. Enter in the field submits the form by
            // synthesising a click on its submit button, so a submit button with
            // this handler would turn every Enter into an ask and nothing could
            // open a highlighted bill. With no submit button, the form's single
            // text field still submits on Enter through `onSubmit`, which honours
            // the highlight. The arrow itself is labelled "Ask", so it always asks.
            type="button"
            onClick={() => {
              if (input.trim()) askTyped();
            }}
            disabled={busy || !input.trim()}
            size="icon"
            aria-label="Ask"
            className="shrink-0 rounded-full disabled:opacity-40 touchable:h-10 touchable:w-10"
          >
            <ArrowUp className="h-5 w-5" strokeWidth={1.75} />
          </Button>
        </form>

        {showList && (
          <div
            // Keeps focus in the field while a row is pressed, so blur does not
            // close the list before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-md border border-line bg-raised text-left shadow-float"
          >
            {bills.length > 0 ? (
              <ul
                id={listId}
                role="listbox"
                // Hover highlights a row; leaving the list hands the highlight
                // back to its default, so a stray pass of the mouse does not
                // change what Enter does.
                onMouseLeave={() =>
                  setHighlight(initialHighlight(suggestions.kind, bills.length))
                }
                aria-label="Matching bills"
                aria-busy={!settled}
                className={`py-1 transition-opacity ${settled ? '' : 'opacity-60'}`}
              >
                {bills.map((bill, i) => (
                  <li
                    key={bill.id}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={i === active}
                  >
                    <Link
                      href={`/bills/${bill.id}`}
                      onClick={() => {
                        trackOpen(i, 'click');
                        setOpen(false);
                      }}
                      onMouseEnter={() => setHighlight(i)}
                      tabIndex={-1}
                      className={`flex items-baseline gap-3 px-4 py-2.5 transition-colors ${
                        i === active ? 'bg-sunken' : 'hover:bg-sunken'
                      }`}
                    >
                      <span className="shrink-0 font-mono text-xs text-ink-3 tabular">
                        {bill.bill_type_label || bill.bill_type?.toUpperCase()} {bill.bill_number}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-ink line-clamp-2 sm:truncate">
                        {bill.title}
                      </span>
                      <span className="hidden shrink-0 text-xs text-ink-2 sm:inline">
                        {compactStageLabel(bill.progress_stage)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p id={listId} className="px-4 py-2.5 text-sm text-ink-3">
                No {formatCongressOrdinal(congress)} Congress bill titles match. Press
                Enter to ask instead.
              </p>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 font-mono text-xs text-ink-3">
              <span className="hidden sm:inline">
                {active >= 0 ? 'Enter opens this bill' : 'Enter asks the question'} · ↑↓ to pick a bill
              </span>
              {bills.length > 0 && (
                <Link
                  href={seeAllHref}
                  tabIndex={-1}
                  onClick={() => {
                    if (suggestions.kind === null) return;
                    analytics.billSuggestionsSeeAllClicked({
                      match_kind: suggestions.kind,
                      query_length: suggestions.forQuery.length,
                      result_count: bills.length,
                    });
                    setOpen(false);
                  }}
                  className="link ml-auto font-sans"
                >
                  See all matching bills →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {starterItems.map((s) =>
          s.href ? (
            <Button key={s.kind} asChild variant="outline" className={PILL}>
              <Link
                href={s.href}
                onClick={() =>
                  analytics.answerStarterClicked({
                    surface: 'home',
                    starter_text: s.text,
                    action: 'open_page',
                    destination: s.href,
                  })
                }
              >
                {s.text}&nbsp;<span aria-hidden="true">→</span>
              </Link>
            </Button>
          ) : (
            <Button
              key={s.text}
              type="button"
              variant="outline"
              onClick={() => {
                analytics.answerStarterClicked({
                  surface: 'home',
                  starter_text: s.text,
                  action: 'ask',
                });
                void ask(s.text, { source: 'starter' });
              }}
              disabled={busy}
              className={PILL}
            >
              {s.text}
            </Button>
          ),
        )}
      </div>
    </div>
  );
}
