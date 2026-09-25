import { cache } from 'react';
import { billsService } from '@/lib/services/bills-service';
import type { Bill } from '@/lib/types/bill';

// Bill IDs look like "1hr119" / "4199s118": number + type + congress. Anything
// else can 404 without a Convex round-trip.
export const BILL_ID_PATTERN = /^\d{1,5}[a-z]{1,7}\d{2,3}$/;

export type BillLookup =
  | { status: 'found'; bill: Bill }
  | { status: 'missing' }
  | { status: 'error' };

/**
 * One bill, with "there is no such bill" kept apart from "we could not ask".
 * The page treats both as a 404; the share image must not, because a crawler
 * that is told an image does not exist caches that answer for as long as it
 * likes, and a Convex blip would then cost the link its picture for good.
 */
export async function lookupBill(id: string): Promise<BillLookup> {
  if (!BILL_ID_PATTERN.test(id)) return { status: 'missing' };
  try {
    return { status: 'found', bill: await billsService.fetchBillById(id) };
  } catch (error) {
    if (error instanceof Error && error.message === 'Bill not found') {
      return { status: 'missing' };
    }
    console.error(`lookupBill(${id}) failed:`, error);
    return { status: 'error' };
  }
}

// Fetch the bill once per request. React's `cache()` dedupes the call shared
// between generateMetadata and the page render (request-scoped only — no
// persistent cache). The page renders dynamically on each request; returns
// null on any failure so the caller can route to notFound() cleanly.
export const getBill = cache(async (id: string): Promise<Bill | null> => {
  const result = await lookupBill(id);
  return result.status === 'found' ? result.bill : null;
});
