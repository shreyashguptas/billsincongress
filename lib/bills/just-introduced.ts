/**
 * "Just introduced": the bills introduced in the last 30 days.
 *
 * This used to be the stage filter `progressStage = 20`, "introduced, no
 * committee action yet". Almost every bill is referred to a committee on the
 * day it is introduced, so that stage is all but empty: in October 2026 it held
 * 11 bills in the whole 119th Congress, every one a number reserved for the
 * Speaker on 3 January 2025. A reader who picked "Just introduced" got those
 * eleven, and with any topic added, "No bills found" (81 times in 30 days).
 * What they wanted was new bills, so that is what the option now means.
 *
 * The URL value stays `status=20`, so bookmarks, search-engine links and the
 * `bills_filter_applied` event keep working; only its translation into query
 * arguments changed, and it happens here, in one place. The "Introduced" STAGE
 * label on bill cards and in the journey is untouched: it is still true of the
 * bills that really are at stage 20.
 *
 * A Congress that was not sitting in the last 30 days has no bills in that
 * window, so there the option keeps its old meaning, stage 20: "Just
 * introduced" on /bills?congress=118 would otherwise always be empty.
 *
 * Pure module so it carries unit tests.
 */
// Relative, as in lib/congress.ts, which imports the same calendar.
import { congressForDate } from '../../convex/catalog/congressCalendar';

/** The `status` URL value of the "Just introduced" option. */
export const JUST_INTRODUCED_STATUS = '20';

/** The introduced-date window it stands for, as `bills.list` understands it. */
export const JUST_INTRODUCED_WINDOW = 'month';

/** That window in days. Must match `cutoffDateForFilter` in convex/bills.ts. */
export const JUST_INTRODUCED_DAYS = 30;

/** How a chip or a summary names the option once it is applied. */
export const JUST_INTRODUCED_LABEL = 'Just introduced';

/** Windows narrower than the one "Just introduced" stands for. */
const NARROWER_WINDOWS = new Set(['week']);

/**
 * The stage and introduced-date arguments for `bills.list` / `bills.listCount`
 * from the page's `status` and `introducedDate` values.
 *
 * "Just introduced" becomes a 30-day introduced-date window with no stage. A
 * narrower date window the reader also chose (the past week) is kept, since it
 * is the stricter of the two; a wider one is replaced, since "introduced in the
 * last year AND in the last 30 days" is the last 30 days.
 */
export function stageAndIntroducedArgs(
  status: string | null | undefined,
  introducedDateFilter: string | null | undefined,
  congress?: string | number | null,
  now: number = Date.now(),
): { progressStage?: number; introducedDateFilter?: string } {
  const window =
    introducedDateFilter && introducedDateFilter !== 'all' ? introducedDateFilter : undefined;
  if (status === JUST_INTRODUCED_STATUS && isJustIntroducedWindow(congress, now)) {
    return {
      introducedDateFilter:
        window && NARROWER_WINDOWS.has(window) ? window : JUST_INTRODUCED_WINDOW,
    };
  }
  const stage = status && status !== 'all' ? Number.parseInt(status, 10) : undefined;
  return {
    ...(stage !== undefined && !Number.isNaN(stage) ? { progressStage: stage } : {}),
    ...(window ? { introducedDateFilter: window } : {}),
  };
}

/**
 * Whether "Just introduced" means the 30-day window for this Congress: no
 * Congress chosen (the newest), or one that was sitting at some point in the
 * window. Any earlier Congress keeps stage 20.
 */
export function isJustIntroducedWindow(
  congress: string | number | null | undefined,
  now: number = Date.now(),
): boolean {
  if (congress === undefined || congress === null || congress === '' || congress === 'all') {
    return true;
  }
  const n = typeof congress === 'number' ? congress : Number.parseInt(congress, 10);
  if (Number.isNaN(n)) return true;
  return n >= congressForDate(justIntroducedSince(now));
}

/**
 * The first ISO date inside the window, as the answer catalog's
 * `introducedAfter` filter takes it. Computed the way `cutoffDateForFilter` in
 * convex/bills.ts computes the list's cutoff, so the assistant is scoped to the
 * same bills the list shows.
 */
export function justIntroducedSince(now: number = Date.now()): string {
  return new Date(now - JUST_INTRODUCED_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
