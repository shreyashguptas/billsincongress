/**
 * Where `/search?q=…` sends a reader.
 *
 * The site has never had a /search page, but readers try it: a browser's
 * site-search shortcut, or a guessed URL. Four visitors got "Page not found"
 * there in the week to 2026-10-07. Our own WebSite JSON-LD (`app/layout.tsx`)
 * already says search lives at `/bills?title={search_term_string}`, so /search
 * goes there, carrying the words under `q`, `query` or `title`.
 *
 * Pure so it carries unit tests; `app/search/route.ts` is the only caller.
 */
import { clampFilterText } from '@/lib/bill-query';

/** Query parameters a search URL might carry the words in, in order of preference. */
const TEXT_PARAMS = ['q', 'query', 'title'] as const;

export function searchRedirectPath(params: URLSearchParams): string {
  for (const name of TEXT_PARAMS) {
    const text = clampFilterText((params.get(name) ?? '').trim());
    if (text !== '') return `/bills?${new URLSearchParams({ title: text }).toString()}`;
  }
  return '/bills';
}
