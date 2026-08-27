/**
 * Number formatting that is identical on the server and in the browser.
 *
 * `toLocaleString()` with no locale uses the runtime default: en-US on the
 * Worker, but the visitor's own locale in the browser (pt-BR gives "17.607",
 * sv gives "17 607"). Markup that disagrees is a hydration mismatch — React
 * discards and re-renders the subtree, which reads as a flash and reports as
 * React error #418. Pinning the locale is the whole fix, and it matches the
 * date formatters here, which pass 'en-US' and an explicit UTC time zone.
 */

/** Digit-grouped count — "17,607" — the same in every locale and on the server. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}
