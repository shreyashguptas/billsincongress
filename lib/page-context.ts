/**
 * What the reader currently has open, as the answer engine sees it.
 *
 * This absorbs two regexes that used to live inline and untested in
 * `answer-provider.tsx`, and fixes what they got wrong. The old `surfaceFor`
 * treated any single segment under `/bills/` as a bill, so all seven hub routes
 * (`/bills/enacted`, `/bills/house`, …) reported `surface: 'bill'` on all
 * fifteen `answer_*` events — and, worse, handed the model a `focusBillId` of
 * `"enacted"`, making the system prompt assert *"The reader is looking at bill
 * enacted."* A bill id now has to look like one.
 *
 * WHAT TRAVELS AND WHAT DOES NOT. The wire carries identifiers and enums only:
 * a route name from a closed set, an integer Congress, and a bill id matched
 * against a pattern. It never carries prose. That is not squeamishness — text
 * injected into a prompt has no `_cite` handle, so `convex/catalog/cite.ts`
 * deletes any citation the model tries to hang on it, and the reader is left
 * with an unsupported sentence on the one site whose whole promise is
 * provenance. Context says WHERE TO LOOK; the retrieval tools still supply
 * every fact, with a handle attached.
 *
 * The four `surface` values are deliberately unchanged. Adding a fifth would
 * silently re-cut every saved PostHog funnel built on the existing four.
 *
 * Pure module so it carries unit tests.
 */
import type { AnswerScope } from './answer-scope';

/** Where the reader is. Six values, closed set, validated again server-side. */
export type AskRoute = 'home' | 'bill' | 'list' | 'hub' | 'learn' | 'other';

/** The analytics surface taxonomy. Unchanged — see the note above. */
export type AskSurface = 'home' | 'bill' | 'filtered' | 'other';

/**
 * A bill id as the site mints them: congress, type, congress-number suffix —
 * e.g. `1234hr119`. Same shape `app/bills/[id]/page.tsx` already validates on.
 */
export const BILL_ID_PATTERN = /^\d{1,5}[a-z]{1,7}\d{2,3}$/;

/** What a route volunteers about itself, beyond what the path already says. */
export interface PublishedContext {
  congress?: number;
  scope?: AnswerScope | null;
}

/** The payload sent with every question. */
export interface PageContext {
  route: AskRoute;
  congress?: number;
  billId?: string;
}

function segments(pathname: string): string[] {
  return pathname.split('?')[0].split('#')[0].split('/').filter(Boolean);
}

export function routeFor(pathname: string): AskRoute {
  const parts = segments(pathname);
  if (parts.length === 0) return 'home';
  if (parts[0] === 'learn') return 'learn';
  if (parts[0] !== 'bills') return 'other';
  if (parts.length === 1) return 'list';
  // `/bills/topic/health` and every reserved hub slug are browse pages; only a
  // segment shaped like a bill id is a bill.
  if (parts.length === 2 && BILL_ID_PATTERN.test(parts[1])) return 'bill';
  return 'hub';
}

/** The bill on screen, or undefined. Never a hub slug. */
export function billIdFor(pathname: string): string | undefined {
  const parts = segments(pathname);
  if (parts.length === 2 && parts[0] === 'bills' && BILL_ID_PATTERN.test(parts[1])) {
    return parts[1];
  }
  return undefined;
}

export function surfaceFor(pathname: string): AskSurface {
  switch (routeFor(pathname)) {
    case 'home':
      return 'home';
    case 'bill':
      return 'bill';
    case 'list':
    case 'hub':
      return 'filtered';
    default:
      return 'other';
  }
}

/**
 * A Congress number is only believable inside the range Congress has actually
 * reached. Anything else is dropped rather than rejected — a bad hint should
 * degrade the answer, never fail the question.
 *
 * Exported because the bills list holds its Congress as a STRING with `'all'`
 * as the not-set sentinel (see `app/bills/filter-signature.ts`), so its call
 * site needs the same rule rather than a parse that yields NaN and trusts
 * something further down to drop it.
 */
export function validCongress(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (typeof n !== 'number' || !Number.isInteger(n)) return undefined;
  if (n < 1 || n > 200) return undefined;
  return n;
}

/**
 * Assemble the payload. The path always wins over what a page published: a
 * stale `congress` left behind by the previous route must never relabel the
 * bill the reader is actually looking at.
 */
export function pageContextFor(
  pathname: string,
  published?: PublishedContext | null,
): PageContext {
  const route = routeFor(pathname);
  const ctx: PageContext = { route };

  const billId = billIdFor(pathname);
  if (billId) ctx.billId = billId;

  const congress = validCongress(published?.congress);
  if (congress !== undefined) ctx.congress = congress;

  return ctx;
}
