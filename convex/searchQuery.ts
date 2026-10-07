/**
 * Shaping reader-typed text into a query Convex full-text search will accept.
 *
 * Convex limits (docs.convex.dev/production/state/limits): a search query
 * returns at most 1,024 documents, contains at most 16 terms, and each term is
 * at most 32 bytes. The term limits are errors, not silent truncations, and
 * readers really do paste long strings — the bills_no_results logs include whole
 * bill titles 25+ words long. So a query is trimmed to fit instead of being
 * allowed to throw: dropping terms past the 16th only widens the result set, so
 * an over-long query degrades into a looser search rather than a failure.
 *
 * Pure module (no Convex imports) so it can carry unit tests.
 */

/** Maximum documents a single Convex search query can return. */
export const SEARCH_LIMIT = 1024;
/** Maximum terms allowed in one search expression. */
export const SEARCH_MAX_TERMS = 16;
/** Maximum size of a single search term. */
export const SEARCH_MAX_TERM_BYTES = 32;

const utf8 = new TextEncoder();

/**
 * Longest prefix of `s` that fits within `maxBytes` of UTF-8, never splitting a
 * character. Counts bytes rather than code units because the Convex limit is a
 * byte limit — a 32-character string of multi-byte characters exceeds it.
 */
export function truncateToBytes(s: string, maxBytes: number): string {
  if (utf8.encode(s).length <= maxBytes) return s;
  let out = "";
  for (const char of s) {
    if (utf8.encode(out + char).length > maxBytes) break;
    out += char;
  }
  return out;
}

/**
 * Trim a reader's query to what Convex search accepts. Returns "" when the
 * query carries no searchable terms, which callers treat as "no text filter"
 * rather than issuing a search that cannot match.
 */
export function sanitizeSearchQuery(raw: string): string {
  return raw
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .slice(0, SEARCH_MAX_TERMS)
    .map((term) => truncateToBytes(term, SEARCH_MAX_TERM_BYTES))
    .join(" ");
}

/**
 * The lowercase words of a reader's title query, or null when it has none.
 * Split once per search and handed to `titleHasEveryWord` for each row.
 *
 * Punctuation at either end of a word goes, as Convex's tokenizer drops it:
 * kept, a quoted '"disabled veterans"' looked for the literal '"disabled' and
 * matched nothing, which the answer engine would report as an exact zero.
 * Inner punctuation stays, so "covid-19" and "u.s" still match titles that have it.
 */
export function titleWords(query: string): string[] | null {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((w) => w.length > 0);
  return words.length > 0 ? words : null;
}

/**
 * True when every word starts a word of the title, case-insensitively — so a
 * half-typed "veter" still finds "veterans", but "ai" does not find "Rail" and
 * "id" does not find "provide". That is how Convex's own search treats a term
 * (whole tokens, with the last one as a prefix), so this never keeps a title
 * the search itself would not have matched on that word.
 *
 * Convex full-text search matches ANY term, ranked by relevance, so a title
 * search on its own is an OR: "disabled veterans" returns every bill with
 * "disabled" or "veterans" in its title. Every caller must narrow it to an AND
 * with this. The /bills page did; the answer engine's copy of the search did
 * not, and told a reader there were "exactly 474" measures about disabled
 * veterans when 13 titles contain both words. One helper, used by both, so the
 * two searches cannot drift apart again.
 */
export function titleHasEveryWord(title: string, words: readonly string[]): boolean {
  const hay = title.toLowerCase();
  return words.every((w) => startsAWord(hay, w));
}

/** Whether `word` occurs in `hay` at the start of a word (not inside one). */
function startsAWord(hay: string, word: string): boolean {
  for (let at = hay.indexOf(word); at !== -1; at = hay.indexOf(word, at + 1)) {
    if (at === 0 || !/[\p{L}\p{N}]/u.test(hay[at - 1])) return true;
  }
  return false;
}
