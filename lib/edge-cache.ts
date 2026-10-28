/**
 * Which requests the Worker may answer from Cloudflare's edge cache, and
 * under which key. Used by `cloudflare-worker.ts`, which wraps the OpenNext
 * Worker.
 *
 * Why this exists. The middleware has marked signed-out pages shareable (today
 * with `CDN-Cache-Control: public, max-age=…`) since September 2026, but
 * nothing ever stored them: a Worker on a Custom Domain runs in front of
 * Cloudflare's cache, so its responses are never cached unless the Worker
 * stores them itself. Every page view was rendered from scratch, with a Convex
 * read, including the ~100,000 crawler requests a week (Bing, OpenAI,
 * Anthropic, Apple, Perplexity, Google) that ask for the same bill pages.
 * Cloudflare reported 13% of requests cached on 22 Oct 2026, nearly all of
 * them static files.
 *
 * The rules fail closed. A request is cached only when every check passes;
 * anything uncertain is passed straight through, which is what happened to
 * every request before this existed.
 *
 * Pure and dependency-free apart from the route allowlist, so it carries
 * unit tests.
 */
import { isPubliclyCacheable, setsOwnCacheControl } from './cacheable-routes';

/**
 * The cookies that mean "this visitor may be signed in". Presence is enough:
 * an expired token plus a refresh token still re-authenticates mid-request.
 * The same names middleware.ts checks before marking a response public.
 */
export const AUTH_COOKIE_NAMES = [
  '__Host-__convexAuthJWT',
  '__convexAuthJWT',
  '__Host-__convexAuthRefreshToken',
  '__convexAuthRefreshToken',
] as const;

/** True when the Cookie header carries any auth cookie. */
export function hasAuthCookie(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(';')
    .map((part) => part.trim().split('=')[0])
    .some((name) => (AUTH_COOKIE_NAMES as readonly string[]).includes(name));
}

/**
 * Headers Next.js sends on in-app navigations and prefetches. Those ask for a
 * React Server Components payload, not the HTML document, at the same URL. The
 * cache stores only the document; the rest pass through.
 */
const RSC_HEADERS = ['rsc', 'next-router-prefetch', 'next-router-state-tree', 'next-router-segment-prefetch'];

/** The query parameter that carries the deploy version inside a cache key. */
export const VERSION_PARAM = '__edge_v';

/**
 * The cache key for a request, or null when it must not touch the cache.
 *
 * The key is the page's own URL plus the deploy version. The version matters
 * because the HTML names content-hashed script files that only the deploy that
 * built them serves; an old page served after a deploy would load scripts that
 * no longer exist. Every deploy therefore starts with an empty cache, and an
 * unknown version (`''`) disables caching rather than sharing a key across
 * deploys.
 */
export function edgeCacheKey(request: Request, version: string): string | null {
  if (!version) return null;
  if (request.method !== 'GET') return null;
  if (RSC_HEADERS.some((name) => request.headers.has(name))) return null;
  if (hasAuthCookie(request.headers.get('cookie'))) return null;

  const url = new URL(request.url);
  if (url.searchParams.has('_rsc') || url.searchParams.has(VERSION_PARAM)) return null;
  if (!isPubliclyCacheable(url.pathname) || setsOwnCacheControl(url.pathname)) return null;

  url.hash = '';
  url.searchParams.set(VERSION_PARAM, version);
  return url.toString();
}

/** Seconds from `max-age=` in a CDN-Cache-Control header, or 0. */
export function sharedMaxAge(cdnCacheControl: string | null): number {
  const match = cdnCacheControl?.match(/(?:^|[,\s])max-age=(\d+)/i);
  return match ? Number(match[1]) : 0;
}

const PRIVATE_DIRECTIVE = /(?:^|[,\s])(?:private|no-store)(?:[,\s]|$)/i;

/**
 * Whether a response the app produced may be stored for everyone. The app has
 * to have said so itself (`CDN-Cache-Control: public, max-age=…`, which the
 * middleware sets only for signed-out requests on allowlisted routes), it must
 * be a successful HTML page, and it must not set a cookie: a response that sets
 * a cookie belongs to the one visitor who received it. A `private` or
 * `no-store` in either header wins.
 */
export function isStorableResponse(response: Response): boolean {
  if (response.status !== 200) return false;
  if (response.headers.has('set-cookie')) return false;
  if (!(response.headers.get('content-type') ?? '').includes('text/html')) return false;
  const cdnCacheControl = response.headers.get('cdn-cache-control') ?? '';
  if (!/(?:^|[,\s])public(?:[,\s]|$)/i.test(cdnCacheControl)) return false;
  if (PRIVATE_DIRECTIVE.test(cdnCacheControl)) return false;
  if (PRIVATE_DIRECTIVE.test(response.headers.get('cache-control') ?? '')) return false;
  return sharedMaxAge(cdnCacheControl) > 0;
}
