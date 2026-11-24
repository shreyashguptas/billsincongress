/**
 * Where the site header's bill search sends the reader, and how it gets there.
 *
 * Why this exists. A header search made while already on /bills used a router
 * navigation, which has the server render the whole page again before anything
 * on screen changes. The list stayed on the previous search for as long as
 * that took (1–4 s for a multi-word search on a warm server, 24 s once), with
 * no sign that anything was happening, and readers searched again: in October
 * 2026, 1 in 5 header searches from the list was followed by another within
 * 30 s, against 1 in 160 from other pages (PostHog Inbox report 01a18369).
 *
 * The list does not need the server for this. `BillsClient` follows the address
 * bar (its `useSearchParams` effect), fetches the new results itself and shows
 * its loading rows meanwhile, exactly as it does for the search box on the page.
 * So on /bills the header search only writes the URL.
 *
 * Pure and dependency-light so it carries unit tests (`header-search.test.ts`).
 */
import { filterSignature } from '@/app/bills/filter-signature';
import { filtersFromQuery } from '@/lib/bills/filter-url';

const BILLS_PATH = '/bills';

/** The URL a header search lands on: `/bills?title=…`, or `/bills` when empty. */
export function headerSearchHref(query: string): string {
  const q = query.trim();
  return q ? `${BILLS_PATH}?title=${encodeURIComponent(q)}` : BILLS_PATH;
}

/**
 * How the header search reaches `href` from the page the reader is on.
 *
 * - `stay`: already on /bills with these exact filters. The list on screen is
 *   that search; writing the URL again would only add a duplicate Back step.
 *   On a deep page (`?page=3`) the reader stays on that page, as they did with
 *   the router navigation: `BillsClient` stays mounted and keeps its page.
 * - `in-place`: on /bills with other filters. Write the URL with the History
 *   API, which Next.js feeds to `useSearchParams`, and the list follows.
 * - `navigate`: any other page. A router navigation, shown as pending.
 */
export type HeaderSearchMove = 'stay' | 'in-place' | 'navigate';

export function headerSearchMove(
  location: { pathname: string; search: string },
  href: string,
): HeaderSearchMove {
  if (location.pathname !== BILLS_PATH) return 'navigate';
  const target = new URL(href, 'https://x.invalid').search;
  // Compared as filter sets, not strings: the list writes `title=a+b` while the
  // header writes `title=a%20b`, and a parameter in another order or a page
  // number is not a different search.
  const same =
    filterSignature(filtersFromQuery(location.search)) ===
    filterSignature(filtersFromQuery(target));
  return same ? 'stay' : 'in-place';
}
