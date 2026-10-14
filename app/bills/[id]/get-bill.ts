import { cache } from 'react';
import { billsService, type BillPageExtras } from '@/lib/services/bills-service';
import type { Bill } from '@/lib/types/bill';

// Bill IDs look like "1hr119" / "4199s118": number + type + congress. Anything
// else can 404 without a Convex round-trip.
export const BILL_ID_PATTERN = /^\d{1,5}[a-z]{1,7}\d{2,3}$/;

export type BillLookup =
  | { status: 'found'; bill: Bill }
  | { status: 'missing' }
  | { status: 'error' };

/** Convex answered, and there is no such bill. Every other failure is "we could not ask". */
function isBillNotFound(error: unknown): boolean {
  return error instanceof Error && error.message === 'Bill not found';
}

/**
 * One bill, with "there is no such bill" kept apart from "we could not ask".
 * Neither the page nor the share image may treat the second as a 404: a crawler
 * that is told a bill or its image does not exist caches that answer for as
 * long as it likes, and a Convex blip would then cost a real bill its index
 * entry or its picture.
 */
export async function lookupBill(id: string): Promise<BillLookup> {
  if (!BILL_ID_PATTERN.test(id)) return { status: 'missing' };
  try {
    return { status: 'found', bill: await billsService.fetchBillById(id) };
  } catch (error) {
    if (isBillNotFound(error)) {
      return { status: 'missing' };
    }
    console.error(`lookupBill(${id}) failed:`, error);
    return { status: 'error' };
  }
}

export interface BillPage {
  bill: Bill;
  extras: BillPageExtras;
}

// Fetch the bill page's data once per request, in one Convex call. React's
// `cache()` dedupes the call shared between generateMetadata and the page
// render (request-scoped only — no persistent cache). The page renders
// dynamically on each request.
//
// Returns null only when the bill does not exist, so the caller can route to
// notFound(). Any other failure is rethrown, so the reader gets the error page
// and its "Try again" (a 5xx) rather than "Page not found" (a 404). On 11 Oct
// 2026 a three-hour Convex outage told every reader, and every crawler, that
// the real bills they opened did not exist.
export const getBillPage = cache(async (id: string): Promise<BillPage | null> => {
  if (!BILL_ID_PATTERN.test(id)) return null;
  try {
    return await billsService.fetchBillPage(id);
  } catch (error) {
    if (isBillNotFound(error)) return null;
    console.error(`getBillPage(${id}) failed:`, error);
    throw error;
  }
});
