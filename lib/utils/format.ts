/**
 * Number formatting that is identical on the server and in the browser.
 *
 * `(17607).toLocaleString()` with no locale uses whatever the runtime's default
 * happens to be. On the server that is the Worker's default, en-US, giving
 * "17,607". In the browser it is the visitor's own locale: pt-BR and de give
 * "17.607", sv and ru give "17 607" with a non-breaking space.
 *
 * Server-rendered markup that disagrees with what the client renders is a
 * hydration mismatch. React does not patch it — it discards that subtree and
 * re-renders it, which the visitor sees as a flash and PostHog recorded as
 * React error #418. Seven of the nine such errors in the ten weeks to 26 Aug
 * 2026 came from pt-BR, sv, de, es-ES and ru browsers; the other two were
 * extension-injected markup, a different cause.
 *
 * Pinning the locale is the whole fix, and it matches what the date formatters
 * in this codebase already do (`Intl.DateTimeFormat('en-US', …)` with an
 * explicit UTC time zone). The site is written in American English and its
 * subject is the United States Congress, so en-US is the right constant rather
 * than a placeholder for real localisation.
 */

/** Digit-grouped count — "17,607" — the same in every locale and on the server. */
export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}
