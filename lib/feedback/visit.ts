import { safeLocalStorage, safeSessionStorage } from '@/lib/safe-storage';

// What the "Did you find what you were looking for?" prompt needs to know about
// this visit (session storage, so a visit is one tab until it closes) and
// whether this browser has already been asked (local storage). Nothing here
// leaves the browser.

const PAGES_KEY = 'bic_visit_pages';
const LAST_PATH_KEY = 'bic_visit_last_path';
const FEEDBACK_KEY = 'bic_visit_feedback_opened';

/** The prompt waits for the reader's third page, so it never greets anyone. */
export const PROMPT_ON_PAGE = 3;

/**
 * Pages where the question would interrupt a task, or has no answer: signing
 * in or up, the account and billing pages, and an alerts unsubscribe link.
 */
const QUIET_PREFIXES = ['/sign-in', '/sign-up', '/forgot-password', '/account', '/pro', '/alerts'];

export function isQuietPage(pathname: string): boolean {
  return QUIET_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Counts a page view and returns how many pages this visit has seen. The same
 * path twice in a row (a re-render, a filter change in the query string) is
 * one page.
 */
export function countPage(pathname: string): number {
  const count = Number(safeSessionStorage.getItem(PAGES_KEY) ?? '0') || 0;
  if (safeSessionStorage.getItem(LAST_PATH_KEY) === pathname) return count;
  safeSessionStorage.setItem(LAST_PATH_KEY, pathname);
  safeSessionStorage.setItem(PAGES_KEY, String(count + 1));
  return count + 1;
}

/** A reader who opened the Feedback box this visit is not asked again. */
export function noteFeedbackOpened() {
  safeSessionStorage.setItem(FEEDBACK_KEY, '1');
}

export function feedbackOpenedThisVisit(): boolean {
  return safeSessionStorage.getItem(FEEDBACK_KEY) === '1';
}

const PROMPT_SEEN_KEY = 'bic_found_it_seen';

/** Once per person, as far as one browser can tell: set when the prompt appears. */
export function notePromptSeen() {
  safeLocalStorage.setItem(PROMPT_SEEN_KEY, '1');
}

export function promptSeenBefore(): boolean {
  return safeLocalStorage.getItem(PROMPT_SEEN_KEY) === '1';
}
