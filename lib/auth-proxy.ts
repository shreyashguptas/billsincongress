/**
 * Google sign-in through billsincongress.com instead of the Convex address.
 *
 * Google's sign-in screen names the site it sends the reader back to. That was
 * `industrious-llama-331.convex.site`, because @convex-dev/auth serves its
 * OAuth start and return pages there. With `CUSTOM_AUTH_SITE_URL` set to
 * https://billsincongress.com in the Convex environment, the library puts our
 * domain in those links instead, and app/api/auth/[...path]/route.ts passes
 * the two pages through to Convex unchanged.
 *
 * The pieces here are pure so they can be tested without a server.
 */

const PROVIDER_ID = /^[a-z0-9_-]+$/i;

/**
 * The Convex path for an OAuth page, or null for anything else. Only the two
 * pages the library serves are passed through: `/api/auth/signin/<provider>`
 * and `/api/auth/callback/<provider>`.
 */
export function oauthUpstreamPath(pathname: string): { path: string; provider: string } | null {
  const match = /^\/api\/auth\/(signin|callback)\/([^/]+)\/?$/.exec(pathname);
  if (!match || !PROVIDER_ID.test(match[2])) return null;
  return { path: `/api/auth/${match[1]}/${match[2]}`, provider: match[2] };
}

/**
 * The cookies Convex set for this provider's sign-in (its state, PKCE, nonce
 * and return-page cookies), and none of the reader's others. The library names
 * them `__Host-<provider>…`, or `<provider>…` on a localhost backend.
 */
export function oauthCookieHeader(provider: string, cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const kept = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const name = part.slice(0, part.indexOf('=')).replace(/^__Host-/, '');
      return part.includes('=') && name.startsWith(provider);
    });
  return kept.length ? kept.join('; ') : null;
}

/**
 * For the middleware: whether a `?code=` on this request is ours to exchange.
 * The middleware swaps a `code` for a session on any page, but on the OAuth
 * pages the code belongs to Convex (the sign-in verifier) or to Google (the
 * reply). Taking it there would end the sign-in with an error.
 */
export function middlewareShouldHandleCode(pathname: string): boolean {
  return !pathname.startsWith('/api/auth/');
}
