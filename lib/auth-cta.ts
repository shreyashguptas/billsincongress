import { safeLocalStorage } from '@/lib/safe-storage';

/**
 * The header's signed-out account slot: which of "Sign in" and "Sign up" it
 * offers, and where each one returns the reader to.
 *
 * The only signal is this browser's own memory. We cannot know whether a
 * signed-out visitor has an account (and asking the server would mean
 * identifying them), but we can know whether an account has ever been signed
 * in *here*. `KNOWN_ACCOUNT_KEY` is set whenever the header sees a signed-in
 * reader and is deliberately kept on sign-out: it holds "1" and nothing else,
 * no email and no id. A device without it — new, cleared, or used only before
 * this shipped — is offered sign-up first, and sign-in is one click away on
 * the sign-up page either way.
 */

export const KNOWN_ACCOUNT_KEY = 'bic_known_account';

export type AuthCta = 'sign_in' | 'sign_up';

/** Remember that an account has been signed in on this device. */
export function rememberAccountOnDevice(): void {
  safeLocalStorage.setItem(KNOWN_ACCOUNT_KEY, '1');
}

/** Has an account ever been signed in on this device? */
export function deviceKnowsAccount(): boolean {
  return safeLocalStorage.getItem(KNOWN_ACCOUNT_KEY) === '1';
}

const AUTH_PAGES: Record<string, AuthCta> = {
  '/sign-in': 'sign_in',
  '/forgot-password': 'sign_in',
  '/sign-up': 'sign_up',
};

/**
 * The buttons to show, most important last (it sits at the edge, and is the
 * one kept on phones).
 *
 * - On an auth page, only the other one: "Sign in" on /sign-in says nothing.
 * - A device that has had an account: "Sign in".
 * - Otherwise both, with "Sign up" the primary.
 */
export function authCtas(pathname: string, knownDevice: boolean): AuthCta[] {
  const onPage = AUTH_PAGES[pathname];
  if (onPage) return [onPage === 'sign_in' ? 'sign_up' : 'sign_in'];
  return knownDevice ? ['sign_in'] : ['sign_in', 'sign_up'];
}

/**
 * The link for a button: back to the page the reader was on, so signing in
 * from a bill lands on that bill. From the home page there is nothing to go
 * back to, so no redirect: the forms' default is the account page. On an auth page the page's own `?redirect=`
 * is carried across instead, so switching between the forms keeps it; the
 * forms validate it (components/auth/safe-redirect.ts).
 */
export function authCtaHref(cta: AuthCta, pathname: string, search: string): string {
  const base = cta === 'sign_in' ? '/sign-in' : '/sign-up';
  const target = AUTH_PAGES[pathname]
    ? new URLSearchParams(search).get('redirect')
    : pathname === '/'
      ? null
      : `${pathname}${search}`;
  return target ? `${base}?redirect=${encodeURIComponent(target)}` : base;
}
