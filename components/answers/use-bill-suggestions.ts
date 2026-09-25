'use client';

import { useEffect, useRef, useState } from 'react';
import type { Bill } from '@/lib/types/bill';
import { billsService } from '@/lib/services/bills-service';
import {
  MAX_SUGGESTIONS,
  SUGGEST_DEBOUNCE_MS,
  suggestKey,
  suggestKind,
  type SuggestKind,
} from '@/lib/bill-suggest';

export interface BillSuggestions {
  /** Bills for the query the reader last paused on. */
  bills: Bill[];
  /** How that query was matched, or null when it was too short to search. */
  kind: SuggestKind | null;
  /** The settled query `bills` answers, so a stale list is never shown as current. */
  forQuery: string;
  /** The Congress `bills` was searched in — half of what makes a list current. */
  forCongress: number | null;
  loading: boolean;
}

const EMPTY: BillSuggestions = {
  bills: [],
  kind: null,
  forQuery: '',
  forCongress: null,
  loading: false,
};

/**
 * Bills matching what is typed in the home ask box, via the same `bills.list`
 * query the /bills search box uses — so bill references ("HR 979") and known
 * acronyms ("KOSA") resolve here exactly as they do there.
 *
 * Responses are cached per Congress and normalised query for the life of the
 * component, and any response for a query or Congress the reader has since
 * moved past is dropped.
 */
export function useBillSuggestions(query: string, congress: number): BillSuggestions {
  const [state, setState] = useState<BillSuggestions>(EMPTY);
  const cache = useRef(new Map<string, Bill[]>());
  const latest = useRef('');

  useEffect(() => {
    const key = suggestKey(query);
    const kind = suggestKind(query);
    const cacheKey = `${congress}:${key}`;
    latest.current = cacheKey;

    if (kind === null) {
      setState(EMPTY);
      return;
    }

    const cached = cache.current.get(cacheKey);
    if (cached) {
      setState({ bills: cached, kind, forQuery: key, forCongress: congress, loading: false });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));
    const timer = setTimeout(() => {
      billsService
        .fetchBills({
          titleFilter: query.trim(),
          itemsPerPage: MAX_SUGGESTIONS,
          congress: String(congress),
        })
        .then(({ data }) => {
          cache.current.set(cacheKey, data);
          if (latest.current !== cacheKey) return;
          setState({ bills: data, kind, forQuery: key, forCongress: congress, loading: false });
        })
        .catch(() => {
          // fetchBills throws when neither Convex nor the same-origin relay
          // answered. Suggestions are optional — the ask path still works —
          // so fail quietly.
          if (latest.current !== cacheKey) return;
          setState({ bills: [], kind, forQuery: key, forCongress: congress, loading: false });
        });
    }, SUGGEST_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, congress]);

  return state;
}
