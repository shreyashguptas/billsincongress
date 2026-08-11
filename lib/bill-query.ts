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
