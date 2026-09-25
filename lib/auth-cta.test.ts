/**
 * Tests for the header's signed-out account slot (lib/auth-cta.ts): which of
 * "Sign in" / "Sign up" a visitor is offered, and where each returns them.
 *
 * Run with: `pnpm test`. Uses node:assert rather than a test framework.
 */
import assert from 'node:assert/strict';
import { authCtaHref, authCtas } from './auth-cta';
import { safeRedirect } from '@/components/auth/safe-redirect';

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

// Which buttons

it('offers a new device both, sign-up as the primary (last)', () => {
  assert.deepEqual(authCtas('/bills/1hr119', false), ['sign_in', 'sign_up']);
});

it('offers a device that has had an account only sign-in', () => {
  assert.deepEqual(authCtas('/bills/1hr119', true), ['sign_in']);
});

it('offers only the other form on an auth page, whatever the device', () => {
  for (const known of [true, false]) {
    assert.deepEqual(authCtas('/sign-in', known), ['sign_up']);
    assert.deepEqual(authCtas('/forgot-password', known), ['sign_up']);
    assert.deepEqual(authCtas('/sign-up', known), ['sign_in']);
  }
});

// Where they go

it('returns the reader to the page they were on, query included', () => {
  const href = authCtaHref('sign_in', '/bills', '?status=100&congress=119');
  assert.equal(href, '/sign-in?redirect=%2Fbills%3Fstatus%3D100%26congress%3D119');
  const target = new URL(href, 'https://billsincongress.com').searchParams.get('redirect');
  assert.equal(safeRedirect(target), '/bills?status=100&congress=119');
});

it('sends no redirect from the home page, so the forms fall back to /account', () => {
  assert.equal(authCtaHref('sign_up', '/', ''), '/sign-up');
});

it('carries an auth page’s own redirect across when switching forms', () => {
  assert.equal(
    authCtaHref('sign_up', '/sign-in', '?redirect=%2Fbills%2F1hr119'),
    '/sign-up?redirect=%2Fbills%2F1hr119',
  );
  assert.equal(authCtaHref('sign_in', '/sign-up', ''), '/sign-in');
});

it('never points an auth page back at itself', () => {
  // Without the auth-page rule, "Sign up" on /sign-in would redirect to /sign-in.
  assert.doesNotMatch(authCtaHref('sign_up', '/sign-in', ''), /redirect/);
});

if (failures.length) {
  console.error(`\nauthCta: ${passed} passed, ${failures.length} FAILED\n`);
  console.error(failures.join('\n\n'));
  process.exit(1);
}
console.log(`authCta: all ${passed} tests passed`);
