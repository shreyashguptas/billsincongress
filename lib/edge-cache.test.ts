/**
 * Tests for the edge-cache rules (lib/edge-cache.ts).
 *
 * A wrong "cache it" is the costly mistake: one visitor's page, or a payload
 * meant for in-app navigation, handed to everyone. So most cases below assert
 * that something is NOT cached.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AUTH_COOKIE_NAMES,
  VERSION_PARAM,
  edgeCacheKey,
  hasAuthCookie,
  isStorableResponse,
  sharedMaxAge,
} from './edge-cache';

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(
      `  ✗ ${name}\n    ${err instanceof Error ? err.message.split('\n').join('\n    ') : String(err)}`,
    );
  }
}

const SITE = 'https://billsincongress.com';
const V = 'v-1234';
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${SITE}${path}`, { headers });

it('keys a signed-out page by its URL and the deploy version', () => {
  assert.equal(edgeCacheKey(get('/bills/4758hr119'), V), `${SITE}/bills/4758hr119?${VERSION_PARAM}=${V}`);
  assert.equal(edgeCacheKey(get('/'), V), `${SITE}/?${VERSION_PARAM}=${V}`);
  // The query string is part of the page (?congress=118 is a different page).
  assert.equal(edgeCacheKey(get('/bills/house?page=2'), V), `${SITE}/bills/house?page=2&${VERSION_PARAM}=${V}`);
});

it('gives each deploy its own keys, and caches nothing without a version', () => {
  assert.notEqual(edgeCacheKey(get('/'), 'a'), edgeCacheKey(get('/'), 'b'));
  assert.equal(edgeCacheKey(get('/'), ''), null);
});

it('never caches for anyone who may be signed in', () => {
  for (const name of AUTH_COOKIE_NAMES) {
    assert.equal(edgeCacheKey(get('/bills/4758hr119', { cookie: `ph_x=1; ${name}=abc` }), V), null, name);
  }
  // Other cookies (analytics) do not make a page personal.
  assert.notEqual(edgeCacheKey(get('/', { cookie: 'ph_phc_123_posthog=%7B%7D' }), V), null);
});

it('reads auth cookies by exact name', () => {
  assert.equal(hasAuthCookie('__convexAuthJWT=x'), true);
  assert.equal(hasAuthCookie(' a=1 ;__Host-__convexAuthRefreshToken=y'), true);
  assert.equal(hasAuthCookie('not__convexAuthJWT=x; __convexAuthJWTx=y'), false);
  assert.equal(hasAuthCookie(null), false);
});

it('never caches in-app navigations or prefetches', () => {
  for (const name of ['rsc', 'next-router-prefetch', 'next-router-state-tree', 'next-router-segment-prefetch']) {
    assert.equal(edgeCacheKey(get('/bills', { [name]: '1' }), V), null, name);
  }
  assert.equal(edgeCacheKey(get('/bills?_rsc=abc'), V), null);
});

it('caches only GETs of allowlisted public routes', () => {
  assert.equal(edgeCacheKey(new Request(`${SITE}/bills`, { method: 'HEAD' }), V), null);
  assert.equal(edgeCacheKey(new Request(`${SITE}/bills`, { method: 'POST' }), V), null);
  for (const path of ['/account', '/sign-in', '/sign-up', '/alerts/abc', '/api/auth/signin', '/sitemap-files/1191']) {
    assert.equal(edgeCacheKey(get(path), V), null, path);
  }
  // The share card sets its own Cache-Control and is cached by its own rules.
  assert.equal(edgeCacheKey(get('/bills/4758hr119/share-image'), V), null);
  // A request that already carries the version parameter is not a page anyone links to.
  assert.equal(edgeCacheKey(get(`/bills?${VERSION_PARAM}=x`), V), null);
});

const html = (cacheControl: string, extra: Record<string, string> = {}, status = 200) =>
  new Response('<html></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': cacheControl, ...extra },
  });

it('stores only what the app itself marked public, for a set time', () => {
  assert.equal(isStorableResponse(html('public, max-age=0, s-maxage=300, stale-while-revalidate=86400')), true);
  assert.equal(isStorableResponse(html('private, no-store')), false);
  assert.equal(isStorableResponse(html('public, max-age=0')), false);
  assert.equal(isStorableResponse(html('public, s-maxage=0')), false);
  assert.equal(isStorableResponse(html('public, s-maxage=300, no-store')), false);
});

it('never stores a response that sets a cookie, an error, or a non-page', () => {
  const pub = 'public, max-age=0, s-maxage=300';
  assert.equal(isStorableResponse(html(pub, { 'set-cookie': 'a=1' })), false);
  assert.equal(isStorableResponse(html(pub, {}, 404)), false);
  assert.equal(isStorableResponse(html(pub, {}, 500)), false);
  const json = new Response('{}', { headers: { 'content-type': 'application/json', 'cache-control': pub } });
  assert.equal(isStorableResponse(json), false);
});

it('reads s-maxage, not max-age', () => {
  assert.equal(sharedMaxAge('public, max-age=0, s-maxage=3600'), 3600);
  assert.equal(sharedMaxAge('public, max-age=600'), 0);
  assert.equal(sharedMaxAge(null), 0);
});

// The two halves must stay in step: middleware.ts marks a response public only
// when no auth cookie is present, and the Worker trusts that only because it
// checks the same cookies before looking in the cache.
it('middleware and the Worker check the same auth cookies', () => {
  const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
  assert.match(middleware, /AUTH_COOKIE_NAMES\.some\(/);
  const worker = readFileSync(new URL('../cloudflare-worker.ts', import.meta.url), 'utf8');
  assert.match(worker, /edgeCacheKey\(/);
  assert.match(worker, /isStorableResponse\(/);
  const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(wrangler, /"main": "cloudflare-worker\.ts"/);
  assert.match(wrangler, /"binding": "CF_VERSION_METADATA"/);
});

if (failures.length > 0) {
  console.error(`\nedge-cache: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`edge-cache: all ${passed} tests passed`);
