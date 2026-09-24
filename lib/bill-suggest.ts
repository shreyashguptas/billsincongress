/**
 * Instant bill suggestions under the home-page ask box.
 *
 * Most of what readers type there is a search, not a question: from 13 to 23
 * Sep 2026, 265 of 340 typed entries were four words or fewer ("HR 979",
 * "Sunshine act", "broadband"), and 66 were a bare bill reference. Each one
 * waited 10–40 seconds for the answer engine to look up something the title
 * index returns in well under a second. Suggestions show those bills while the
 * reader is still typing; the ask path is unchanged for anything else.
 *
 * Pure module (imports only other pure modules) so it carries unit tests.
 */
import { expandSearchAcronym, parseBillReference } from './bill-query';

/** Below this many characters a title search matches too much to be useful. */
export const MIN_SUGGEST_LENGTH = 2;

/** Rows shown. Enough to hold every bill type sharing one number (≤ 8 is rare). */
export const MAX_SUGGESTIONS = 5;

/** Wait for typing to pause before searching, so one word is one request. */
export const SUGGEST_DEBOUNCE_MS = 150;

/**
 * How the query will be matched — mirrors `resolveTextQuery` in
 * `lib/services/bills-service.ts`, which is what actually runs it.
 */
export type SuggestKind = 'number' | 'acronym' | 'title';

export function suggestKind(raw: string): SuggestKind | null {
  const q = raw.trim();
  if (q.length < MIN_SUGGEST_LENGTH) {
    // A single digit is still a complete bill reference ("S 5").
    return parseBillReference(q) ? 'number' : null;
  }
  if (parseBillReference(q)) return 'number';
  if (expandSearchAcronym(q)) return 'acronym';
  return 'title';
}

/** Normalised key so "HR 979" and "hr  979 " share one request and cache entry. */
export function suggestKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Where a highlight moves on ArrowUp / ArrowDown.
 *
 * -1 means nothing is highlighted, which is also where Enter asks the question
 * as typed. Moving past either end returns there rather than wrapping to the
 * far row, so the reader always has a way back to plain asking.
 */
export function moveHighlight(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current === -1) return delta === 1 ? 0 : count - 1;
  const next = current + delta;
  return next < 0 || next >= count ? -1 : next;
}

/**
 * Which row starts highlighted when results arrive.
 *
 * Only a bill reference pre-selects, and only when it resolved to exactly one
 * bill: "HR 979" plainly names that bill, so Enter opens it. A title search is
 * never pre-selected — "climate change" may be a real question, and Enter must
 * still ask it.
 */
export function initialHighlight(kind: SuggestKind | null, count: number): number {
  return kind === 'number' && count === 1 ? 0 : -1;
}
