/**
 * Recognising a member's name typed into the /bills title search.
 *
 * The title search needs every word to appear in a bill's title, so a person's
 * name never matches: "jamie raskin" returns nothing, while the sponsor filter
 * for Jamie Raskin returns his bills. Readers did this a lot. Since 26 Sep 2026,
 * about 6 of the 23 people whose title search came back empty had typed a name
 * ("mike collins" 4 times, "jamie raskin" 3 times, "elizabeth warren", "warner").
 * When a title search is empty, the empty state offers the sponsor filter
 * instead, and this module decides whether the text names exactly one sponsor.
 *
 * Pure module (no imports) so it carries unit tests.
 */

export interface SponsorName {
  name: string;
}

export type SponsorMatchKind = 'full_name' | 'first_last' | 'last_name';

export interface SponsorMatch<T extends SponsorName> {
  sponsor: T;
  kind: SponsorMatchKind;
}

/** Name suffixes readers leave off: "Mike Collins" for "Mike Collins Jr.". */
const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv']);

/** A surname this short matches too much by chance ("Li", "Ng") to guess from alone. */
const MIN_SURNAME_LENGTH = 3;

/** Lowercase words with accents and punctuation removed: "Nydia M. Velázquez" → nydia m velazquez. */
export function nameTokens(raw: string): string[] {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t !== '' && !SUFFIXES.has(t));
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/** The one element of a list, or null when there are none or several. */
function only<T>(list: T[]): T | null {
  return list.length === 1 ? list[0] : null;
}

/**
 * The sponsor the text names, or null when it names none or more than one.
 *
 * Tried from most to least specific, and each step must be unambiguous on its
 * own — a guess that picks one of two people is worse than no suggestion:
 *   1. the whole name ("Jamie Raskin");
 *   2. first and last name, skipping middle names and initials ("Nydia
 *      Velazquez" for "Nydia M. Velázquez");
 *   3. the last name alone, including two-word ones ("Raskin", "Van Drew").
 */
export function matchSponsorName<T extends SponsorName>(
  query: string,
  sponsors: readonly T[],
): SponsorMatch<T> | null {
  const q = nameTokens(query);
  if (q.length === 0) return null;

  // `listAllSponsors` lists each member once, under one spelling, so a name
  // that matches two entries really is two people.
  const named = sponsors.map((sponsor) => ({ sponsor, tokens: nameTokens(sponsor.name) }));

  const full = only(named.filter((s) => sameTokens(s.tokens, q)));
  if (full) return { sponsor: full.sponsor, kind: 'full_name' };

  if (q.length >= 2) {
    const firstLast = only(
      named.filter(
        (s) =>
          s.tokens.length > q.length &&
          s.tokens[0] === q[0] &&
          sameTokens(s.tokens.slice(s.tokens.length - (q.length - 1)), q.slice(1)),
      ),
    );
    if (firstLast) return { sponsor: firstLast.sponsor, kind: 'first_last' };
  }

  if (q.join(' ').length < MIN_SURNAME_LENGTH) return null;
  const last = only(
    named.filter(
      (s) => s.tokens.length > q.length && sameTokens(s.tokens.slice(s.tokens.length - q.length), q),
    ),
  );
  return last ? { sponsor: last.sponsor, kind: 'last_name' } : null;
}
