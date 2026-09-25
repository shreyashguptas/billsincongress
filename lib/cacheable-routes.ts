/**
 * Which page routes may be cached by a shared cache when nobody is signed in.
 *
 * Pure and dependency-free so the middleware's one interesting decision can be
 * tested without a request object.
 *
 * The rule is an allowlist. A public route that is missing from it is simply
 * uncached — slower, but correct, and that is what every route except `/bills`
 * did before this existed. The opposite mistake, a personalised route slipping
 * through a denylist gap, would put one visitor's page in a shared cache. So
 * the list fails in the direction that costs milliseconds rather than privacy.
 *
 * The caller still decides based on the auth cookie: this only says "this
 * route is capable of being public", never "this response is public".
 */

/** Routes whose anonymous response is identical for every visitor. */
// `/pro` qualifies: its server HTML is the same for everyone, and the plan
// state and subscribe buttons are rendered client-side from the reader's session.
const PUBLIC_EXACT = new Set(['/', '/about', '/learn', '/privacy', '/pro', '/terms']);

/** Route trees whose anonymous responses are identical for every visitor. */
const PUBLIC_PREFIXES = ['/bills'];

/**
 * Never cacheable, whatever else matches: these are personalised or part of an
 * auth flow. Listed explicitly so that adding a prefix above can't silently
 * swallow one of them.
 */
const NEVER_CACHEABLE_PREFIXES = [
  '/account',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/alerts', // carries a reader's unsubscribe token in the URL
  '/api',
];

/** True when this path's signed-out response may go in a shared cache. */
export function isPubliclyCacheable(pathname: string): boolean {
  // Trailing slashes and casing both reach middleware; normalise so `/Learn/`
  // is not quietly treated as a different, uncacheable route.
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';

  if (NEVER_CACHEABLE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) {
    return false;
  }
  // A nested "api" segment anywhere is treated as an API route, matching the
  // guard this replaced (`!pathname.includes("api")` on the /bills branch).
  if (path.split('/').includes('api')) return false;

  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Routes that write their own Cache-Control, which the middleware must leave
 * alone. The middleware's page policy (five minutes at the edge) would
 * otherwise overwrite it: a response header set there wins over the route's.
 *
 * `/bills/<id>/share-image` is the share card, whose URL carries the bill's
 * stage, so it can be cached for a day where a page cannot.
 */
const OWN_CACHE_CONTROL = [/^\/bills\/[^/]+\/share-image$/];

/** True when the route at this path sets its own Cache-Control. */
export function setsOwnCacheControl(pathname: string): boolean {
  const path = pathname.toLowerCase().replace(/\/+$/, '') || '/';
  return OWN_CACHE_CONTROL.some((pattern) => pattern.test(path));
}
