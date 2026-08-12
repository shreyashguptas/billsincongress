/**
 * Recognising a bill reference typed into the search box.
 *
 * The search box feeds the title index, and a bill number appears in no bill's
 * title — so "HR 7540" could never match anything no matter how good the search
 * got. Roughly 170 of the zero-result searches recorded in 30 days were bill
 * references, typed in every format people actually use: "HR 7540",
 * "H.R. 6662", "h.r 7865", "Hb 2611", "Hr88", "s 29", "S.935", "H B 8344",
 * "h. con. res. 113", and bare numbers like "9244". Every one of those has an
 * exact indexed lookup waiting for it; nothing was routing them there.
 *
 * Pure module (no imports) so it can carry unit tests and run unchanged on the
 * server render and in the browser.
 */

/**
 * Acronyms readers search for that appear in no bill title.
 *
 * "NDAA" is the clearest case: the bill is titled "National Defense
 * Authorization Act for Fiscal Year 2027" and the letters N-D-A-A occur nowhere
 * in it, so no amount of search-index work could ever match. 41 people typed it
 * in 30 days and 34 typed "KOSA"; both got nothing.
 *
 * Expansion happens at query time, which is why this is a curated list rather
 * than a derived field: it needs no schema change and no backfill.
 *
 * ADMISSION RULE, and it is not optional: an acronym belongs here only if the
 * acronym alone currently returns *zero* bills while its expansion returns some.
 * Expansion replaces the query, so adding one that already works destroys
 * results. Measured against production, a plausible-looking longer list did
 * exactly that — CHIP went 20 results to 0, IRA 95 to 1, SNAP 49 to 4, CRA 23 to
 * 8, FOIA 2 to 0. Every candidate must be checked both ways before it is added.
 *
 * Consequently absent: acronyms that appear in titles verbatim (CHIPS, CARES,
 * DREAM, SAVE, SNAP, IRA, CRA, ACA, ADA), and ones whose expansion finds nothing
 * (HIPAA, NAFTA). Also absent are ESA and SSA: their bare forms do return a
 * result or two, but only as incidental substring hits inside longer words, so
 * whether expansion helps is a judgement call rather than a measurement — left
 * out until it can be made deliberately.
 */
const ACRONYM_EXPANSIONS: Readonly<Record<string, string>> = {
  ndaa: 'national defense authorization act', // 0 -> 14
  kosa: 'kids online safety act', //             0 -> 2
  flsa: 'fair labor standards act', //           0 -> 4
  vawa: 'violence against women act', //         0 -> 2
  esea: 'elementary and secondary education act', // 0 -> 6
};

/**
 * Expand a search that is entirely a known acronym, or null when it isn't one.
 *
 * Deliberately only matches a whole query. Expanding an acronym inside a longer
 * phrase would fight the every-term-must-match rule — "kosa bill" would become
 * "kids online safety act bill" and then require the word "bill" in the title,
 * finding less than before rather than more.
 */
export function expandSearchAcronym(raw: string): string | null {
  const key = raw.trim().toLowerCase().replace(/[.\s]/g, '');
  return ACRONYM_EXPANSIONS[key] ?? null;
}

/** Acronyms this module knows how to expand — for tests and diagnostics. */
export const KNOWN_ACRONYMS = Object.keys(ACRONYM_EXPANSIONS);

export interface BillReference {
  /** Convex `billType`, or null when only a number was given. */
  billType: string | null;
  /** Digits only, no leading zeros stripped (bill numbers have none). */
  billNumber: string;
}

/**
 * Written forms readers use, mapped to the `billType` stored in Convex.
 *
 * The aliases matter as much as the canonical spellings. "HB"/"SB" are state
 * legislature habits carried over to Congress, where the equivalents are H.R.
 * and S.; a bare "H" prefix ("H1232") means the same. Getting these wrong sends
 * someone to an empty page, so they are mapped rather than rejected.
 */
const TYPE_ALIASES: Readonly<Record<string, string>> = {
  hconres: 'hconres',
  hcr: 'hconres',
  sconres: 'sconres',
  scr: 'sconres',
  hjres: 'hjres',
  hjr: 'hjres',
  sjres: 'sjres',
  sjr: 'sjres',
  hres: 'hres',
  sres: 'sres',
  hr: 'hr',
  hb: 'hr',
  h: 'hr',
  s: 's',
  sb: 's',
};

// Longest tokens first so "hconres" is preferred over "hr" then "h", which
// alternation would otherwise match against the same prefix.
const TYPE_PATTERN = Object.keys(TYPE_ALIASES)
  .sort((a, b) => b.length - a.length)
  .join('|');

/**
 * Anchored end to end, so only a query that is *entirely* a bill reference is
 * treated as one. This is what keeps ordinary title searches containing digits
 * ("9/11 commission", "section 8 housing", "covid 19") out of the number path —
 * they have text after the digits and so never match.
 *
 * Bill numbers run to four digits today; the limit of five leaves headroom
 * without swallowing longer digit strings like "217198", which are ambiguous
 * and better served by a text search.
 */
const REFERENCE_PATTERN = new RegExp(
  `^(?:the)?(?:bill)?(${TYPE_PATTERN})?(\\d{1,5})$`,
);

/**
 * Parse a search string as a bill reference, or null when it isn't one.
 *
 * Punctuation and spacing are discarded before matching, which is what collapses
 * "H.R. 6662", "H B 8344" and "hr6662" into the same thing.
 */
export function parseBillReference(raw: string): BillReference | null {
  const compact = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (compact === '') return null;

  const found = REFERENCE_PATTERN.exec(compact);
  if (!found) return null;

  const [, typeToken, digits] = found;
  // A leading zero would not match any stored bill number.
  if (digits.startsWith('0')) return null;

  return {
    billType: typeToken ? TYPE_ALIASES[typeToken] : null,
    billNumber: digits,
  };
}
