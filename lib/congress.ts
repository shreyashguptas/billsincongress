/**
 * Congress number ↔ calendar year helpers — the single source of truth for
 * how Congress numbers are displayed across the site.
 *
 * Year convention (matches congress.gov): the two calendar years in which a
 * given Congress legislates. 119th = 2025–2026. The 1st Congress convened
 * in 1789.
 */

const FIRST_CONGRESS_YEAR = 1789;

/** First calendar year of a Congress (119 → 2025). */
export function congressStartYear(congress: number): number {
  return FIRST_CONGRESS_YEAR + (congress - 1) * 2;
}

/** Ordinal suffix: 1→st, 2→nd, 3→rd, 4→th, with 11/12/13 → th. */
export function ordinalSuffix(n: number): string {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) return 'st';
  if (j === 2 && k !== 12) return 'nd';
  if (j === 3 && k !== 13) return 'rd';
  return 'th';
}

/** "119th" — compact form for tight spots (bill-card meta, chart labels). */
export function formatCongressOrdinal(congress: number): string {
  return `${congress}${ordinalSuffix(congress)}`;
}

/** "2025–2026" (en dash). */
export function formatCongressYears(congress: number): string {
  const start = congressStartYear(congress);
  return `${start}–${start + 1}`;
}

/** "2025–26" — abbreviated years for small UI chips. */
export function formatCongressYearsShort(congress: number): string {
  const start = congressStartYear(congress);
  return `${start}–${String(start + 1).slice(-2)}`;
}

/** "2025–2026 · 119th Congress" — pickers and filters (years first). */
export function formatCongressPicker(congress: number): string {
  return `${formatCongressYears(congress)} · ${formatCongressOrdinal(congress)} Congress`;
}

/** "119th Congress (2025–2026)" — prose, headers, page metadata, aria-labels. */
export function formatCongressProse(congress: number): string {
  return `${formatCongressOrdinal(congress)} Congress (${formatCongressYears(congress)})`;
}

/**
 * Year span across several Congresses: first year of the oldest through last
 * year of the newest (117..119 → "2021–2026"). Collapses to a single
 * Congress's years when oldest === newest.
 */
export function formatCongressYearSpan(oldest: number, newest: number): string {
  return `${congressStartYear(oldest)}–${congressStartYear(newest) + 1}`;
}

/** Ordinal span: 117..119 → "117th–119th"; collapses to "119th" when equal. */
export function formatCongressOrdinalSpan(oldest: number, newest: number): string {
  if (oldest === newest) return formatCongressOrdinal(oldest);
  return `${formatCongressOrdinal(oldest)}–${formatCongressOrdinal(newest)}`;
}
