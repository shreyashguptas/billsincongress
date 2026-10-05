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
import { MAX_SEARCH_TEXT_LENGTH, expandSearchAcronym, parseBillReference } from './bill-query';

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
  // The ask box takes 2,000 characters, the bills search 120. A longer entry
  // is a question, not a title: cut to 120 characters it matches nothing, so
  // searching it would only cost a request per keystroke. Before 30 Sep 2026
  // those requests also failed on the server (206 console errors in 3 sessions
  // on 29 Sep); the bills service now clamps them, but they still find nothing.
  if (q.length > MAX_SEARCH_TEXT_LENGTH) return null;
  // A question is not a title. From 4 Sep to 4 Oct 2026, suggestions found a
  // bill only for text of 20 characters or fewer: the 596 searches past that,
  // from about 55 people, found nothing and were never clicked. Stop as soon as
  // the text reads as a question rather than at the length cap.
  if (readsAsQuestion(q)) return null;
  if (parseBillReference(q)) return 'number';
  if (expandSearchAcronym(q)) return 'acronym';
  return 'title';
}

/** Words a question starts with and a bill title does not. */
const QUESTION_WORDS = new Set(['how', 'what', 'which', 'who', 'whom', 'whose', 'why', 'when', 'where']);

/**
 * Whether text is a question for the assistant rather than words from a bill
 * title: it ends in "?", or it opens with a question word and runs to at least
 * three words. Opening words like "is", "do" or "can" are left out, because
 * titles start with them too ("Do No Harm Act"); those questions still count
 * when they end in "?".
 *
 * Used by the home-page suggestions (stop searching titles) and by the `/bills`
 * empty state (offer to ask the question instead).
 */
export function readsAsQuestion(raw: string): boolean {
  const q = raw.trim().toLowerCase();
  if (q.endsWith('?')) return true;
  const words = q.split(/\s+/).filter(Boolean);
  return words.length >= 3 && QUESTION_WORDS.has(words[0].replace(/[^a-z]/g, ''));
}

/** Normalised key so "HR 979" and "hr  979 " share one request and cache entry. */
export function suggestKey(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Whether a result set answers what is on screen now: the same normalised text
 * AND the same Congress. Text alone is not enough — switching Congress with a
 * query still in the box would otherwise treat the previous Congress's bills as
 * current, pickable with Enter.
 */
export function isSettled(
  result: { forQuery: string; forCongress: number | null },
  input: string,
  congress: number,
): boolean {
  return result.forCongress === congress && result.forQuery === suggestKey(input);
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
