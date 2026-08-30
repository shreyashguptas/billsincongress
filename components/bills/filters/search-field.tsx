'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

/** Long enough to absorb a word, short enough not to feel laggy. */
const DEBOUNCE_MS = 250;

export interface SearchFieldProps {
  /** The committed value — i.e. what is in the URL. */
  value: string;
  onCommit: (next: string) => void;
}

/**
 * The bill search box: title words or a bill number, in one field.
 *
 * **Why one field.** There were two — a title box and a 64px-wide "Bill #" box
 * that could not display a five-digit number, and which silently switched off
 * reference parsing when it had anything in it. The service already routes
 * "HR 7540", "s.4784" and a bare "9244" to an indexed number lookup, so the
 * second box was asking the reader to do the routing by hand.
 *
 * **Why debounced.** Every keystroke used to fire two Convex queries. Typing
 * "healthcare" was twenty round trips, ten skeleton flashes and ten re-staggers
 * of the results grid — and it fired a `bills_no_results` event for every
 * intermediate prefix that matched nothing, which is why that metric read as
 * 10,597 dead ends from 1,436 people in ninety days.
 *
 * The resync effect is the fiddly part. It has to distinguish our own commit
 * echoing back through props from a genuine external change (a Back press, a
 * "clear all"), and it must cancel any pending commit when the latter happens —
 * otherwise a Back press landing 200ms after a keystroke gets overwritten when
 * the stale timer fires, silently re-applying the query you just navigated away
 * from.
 */
export function SearchField({ value, onCommit }: SearchFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommitted = useRef(value);

  useEffect(() => {
    if (value === lastCommitted.current) return; // our own commit, echoing back
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    lastCommitted.current = value;
    setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Trimmed, so a space bar press can never reach the URL and produce an
    // active filter with nothing in it.
    const trimmed = next.trim();
    if (trimmed === lastCommitted.current) return;
    lastCommitted.current = trimmed;
    onCommit(trimmed);
  };

  const handleChange = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(next), DEBOUNCE_MS);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Search bills
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit(draft);
          }
        }}
        onBlur={() => commit(draft)}
        placeholder="Search bills, or type a bill number"
        // text-base on touch: anything smaller makes iOS Safari zoom in on
        // focus and never zoom back out.
        className="h-10 w-full rounded-sm border border-control bg-card pl-10 pr-10 font-sans text-sm text-foreground placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/10 touchable:h-11 touchable:text-base [&::-webkit-search-cancel-button]:hidden"
      />
      {draft !== '' && (
        <button
          type="button"
          onClick={() => {
            setDraft('');
            commit('');
          }}
          aria-label="Clear search"
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
