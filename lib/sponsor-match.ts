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
  party?: string;
  state?: string;
}

export type SponsorMatchKind = 'full_name' | 'first_last' | 'last_name';

export interface SponsorMatch<T extends SponsorName> {
  /** The spelling to show: the first that is not all capitals. */
  sponsor: T;
  /** Every spelling the sponsor list holds for this member, to filter by all of them. */
  names: string[];
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

const allCaps = (name: string) => name === name.toUpperCase();

interface Member<T> {
  sponsor: T;
  names: string[];
  tokens: string[];
}

/**
 * The sponsor list grouped into members. Congress.gov records some members
 * under two spellings, "ADAM SCHIFF" and "Adam Schiff", or "NYDIA VELAZQUEZ"
 * and "Nydia Velázquez": 45 members in the 2026-10-04 list, each a separate
 * row. Read as two people, every name readers type for them looks ambiguous
 * and gets no suggestion. Spellings that differ only in case and accents, with
 * the same party and state, are one member.
 */
function members<T extends SponsorName>(sponsors: readonly T[]): Member<T>[] {
  const byKey = new Map<string, Member<T>>();
  for (const sponsor of sponsors) {
    const tokens = nameTokens(sponsor.name);
    const key = [tokens.join(' '), sponsor.party ?? '', sponsor.state ?? ''].join('|');
    const member = byKey.get(key);
    if (!member) {
      byKey.set(key, { sponsor, names: [sponsor.name], tokens });
      continue;
    }
    member.names.push(sponsor.name);
    if (allCaps(member.sponsor.name) && !allCaps(sponsor.name)) member.sponsor = sponsor;
  }
  return [...byKey.values()];
}

function found<T extends SponsorName>(m: Member<T>, kind: SponsorMatchKind): SponsorMatch<T> {
  return { sponsor: m.sponsor, names: m.names, kind };
}

/**
 * The member the text names, or null when it names none or more than one.
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

  const named = members(sponsors);

  const full = only(named.filter((s) => sameTokens(s.tokens, q)));
  if (full) return found(full, 'full_name');

  if (q.length >= 2) {
    const firstLast = only(
      named.filter(
        (s) =>
          s.tokens.length > q.length &&
          s.tokens[0] === q[0] &&
          sameTokens(s.tokens.slice(s.tokens.length - (q.length - 1)), q.slice(1)),
      ),
    );
    if (firstLast) return found(firstLast, 'first_last');
  }

  if (q.join(' ').length < MIN_SURNAME_LENGTH) return null;
  const last = only(
    named.filter(
      (s) => s.tokens.length > q.length && sameTokens(s.tokens.slice(s.tokens.length - q.length), q),
    ),
  );
  return last ? found(last, 'last_name') : null;
}
