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
