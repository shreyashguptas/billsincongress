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

const PAGE = { 'cache-control': 'no-cache', 'cdn-cache-control': 'public, max-age=300' };
const html = (headers: Record<string, string> = PAGE, status = 200) =>
  new Response('<html></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });

it('stores only what the app itself marked public for the edge, for a set time', () => {
  assert.equal(isStorableResponse(html()), true);
  assert.equal(isStorableResponse(html({ 'cache-control': 'private, no-store' })), false);
  // No CDN-Cache-Control: the app did not ask the edge to keep it.
  assert.equal(isStorableResponse(html({ 'cache-control': 'public, max-age=0, s-maxage=300' })), false);
  assert.equal(isStorableResponse(html({ 'cdn-cache-control': 'max-age=300' })), false);
  assert.equal(isStorableResponse(html({ 'cdn-cache-control': 'public, max-age=0' })), false);
  assert.equal(isStorableResponse(html({ 'cdn-cache-control': 'public, max-age=300, no-store' })), false);
  assert.equal(isStorableResponse(html({ ...PAGE, 'cache-control': 'private, no-store' })), false);
});

it('never stores a response that sets a cookie, an error, or a non-page', () => {
  assert.equal(isStorableResponse(html({ ...PAGE, 'set-cookie': 'a=1' })), false);
  assert.equal(isStorableResponse(html(PAGE, 404)), false);
  assert.equal(isStorableResponse(html(PAGE, 500)), false);
  const json = new Response('{}', { headers: { ...PAGE, 'content-type': 'application/json' } });
  assert.equal(isStorableResponse(json), false);
});

it('reads max-age from CDN-Cache-Control', () => {
  assert.equal(sharedMaxAge('public, max-age=3600'), 3600);
  assert.equal(sharedMaxAge('public, s-maxage=600'), 0);
  assert.equal(sharedMaxAge(null), 0);
});

// A browser that keeps the HTML can load a page whose script files the current
// deploy no longer serves. Only the edge, which starts empty on every deploy,
// may keep a copy.
it('tells the browser to ask again on every load', () => {
  const middleware = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
  assert.match(middleware, /"Cache-Control", "no-cache"/);
  assert.match(middleware, /"CDN-Cache-Control", `public, max-age=/);
  assert.doesNotMatch(middleware, /stale-while-revalidate=/);
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
