/**
 * Passes Google sign-in's two pages through to Convex, so the address Google
 * shows the reader is billsincongress.com. See lib/auth-proxy.ts.
 *
 * Only `/api/auth/signin/<provider>` and `/api/auth/callback/<provider>` are
 * served; `/api/auth` itself (sign-in and sign-out actions) is handled by the
 * middleware and never reaches this route.
 */
import { convexSiteUrl } from '@/lib/convex-site';
import { oauthCookieHeader, oauthUpstreamPath } from '@/lib/auth-proxy';

async function pass(request: Request): Promise<Response> {
  const siteUrl = convexSiteUrl();
  const url = new URL(request.url);
  const target = oauthUpstreamPath(url.pathname);
  if (!siteUrl || !target) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  const cookie = oauthCookieHeader(target.provider, request.headers.get('cookie'));
  if (cookie) headers.set('cookie', cookie);
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const upstream = await fetch(`${siteUrl}${target.path}${url.search}`, {
    method: request.method,
    headers,
    body: request.method === 'POST' ? await request.arrayBuffer() : undefined,
    // Both pages answer with a redirect (to Google, then back to the site),
    // which the reader's browser must follow, not this server.
    redirect: 'manual',
  });

  const out = new Headers({ 'Cache-Control': 'no-store' });
  const location = upstream.headers.get('location');
  if (location) out.set('location', location);
  const type = upstream.headers.get('content-type');
  if (type) out.set('content-type', type);
  for (const setCookie of upstream.headers.getSetCookie()) out.append('set-cookie', setCookie);

  return new Response(upstream.body, { status: upstream.status, headers: out });
}

export const GET = pass;
// Providers that reply with a form post (Apple) use POST; Google uses GET.
export const POST = pass;
