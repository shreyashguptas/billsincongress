/**
 * Searching a filter's option list.
 *
 * Every long option list on /bills — policy areas, states, sponsors, bill
 * kinds — is searched by the same rules, so the behaviour is defined once here
 * rather than re-derived per control. The matcher was lifted from the sponsor
 * typeahead, which was the only list that had one; the rest were unsearchable
 * native `<select>` menus.
 *
 * Two rules do the real work:
 *
 *  - Tokenised AND. "tx smith" matches "Smith · R · TX" because each token is
 *    looked for independently, anywhere in the haystack. People type the two
 *    things they remember, in whichever order they remember them.
 *  - Prefix before substring. Typing "ma" should offer Maine before Alabama.
 *    Ranking is stable within each tier, so a caller's deliberate ordering
 *    (reader-interest for statuses, alphabetical for states) survives.
 *
 * Pure module — no React, no DOM — so it can be unit tested by `pnpm test`,
 * which runs plain `tsx` scripts with no browser environment.
 */

export interface OptionSearchResult<T> {
  /** Matches, capped at `limit`. */
  items: T[];
  /** How many matched before the cap. Equal to `items.length` when uncapped. */
  total: number;
  /** True when `total > items.length`, i.e. the caller must say so in the UI. */
  truncated: boolean;
}

export interface OptionSearchArgs<T> {
  /**
   * The text a row is matched against. Include everything a person might type:
   * a sponsor row returns "Maria Salazar R FL", not just the name.
   */
  keyOf: (item: T) => string;
  /** Values to leave out entirely — already-selected items in a multi-select. */
  exclude?: ReadonlySet<string>;
  /** Identity used against `exclude`. Defaults to `keyOf`. */
  idOf?: (item: T) => string;
  /** Maximum rows returned. Defaults to 100. */
  limit?: number;
}

/** Split a query into lowercase tokens, dropping empties. */
function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Filter and rank `items` against `query`.
 *
 * An empty query is not a special case that returns nothing — it returns
 * everything, because the list opens before anyone has typed.
 */
export function searchOptions<T>(
  items: readonly T[],
  query: string,
  { keyOf, exclude, idOf, limit = 100 }: OptionSearchArgs<T>,
): OptionSearchResult<T> {
  const identity = idOf ?? keyOf;
  const base =
    exclude && exclude.size > 0
      ? items.filter((item) => !exclude.has(identity(item)))
      : items.slice();

  const tokens = tokenize(query);

  let matched: T[];
  if (tokens.length === 0) {
    matched = base;
  } else {
    // Two passes rather than a sort: a comparator would have to re-derive the
    // haystack per comparison, and partitioning is what "stable within rank"
    // actually means.
    const prefix: T[] = [];
    const substring: T[] = [];
    for (const item of base) {
      const haystack = keyOf(item).toLowerCase();
      if (!tokens.every((t) => haystack.includes(t))) continue;
      if (haystack.startsWith(tokens[0])) prefix.push(item);
      else substring.push(item);
    }
    matched = prefix.concat(substring);
  }

  const total = matched.length;
  return {
    items: total > limit ? matched.slice(0, limit) : matched,
    total,
    truncated: total > limit,
  };
}
