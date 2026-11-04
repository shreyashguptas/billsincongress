/**
 * How a hub page gets its bills, and what it does when it can't.
 *
 * The sorted read can fail while the unsorted one works: that happens for as
 * long as the site is deployed ahead of the Convex functions (`bills.listSorted`
 * arrives with the same change). The page then shows the bills without claiming
 * an order (`sortedBy: null`).
 *
 * When both reads fail, this throws. It used to fall back to an empty list,
 * which rendered "No bills match this in the current Congress" with a 200: a
 * false statement in the site's own voice, and, once signed-out pages were
 * cached at the edge (cloudflare-worker.ts), one that every reader at that data
 * centre would get for five minutes. A throw gives the reader the error page and
 * its "Try again" with a 500, which the edge cache never stores. The same rule
 * as getBillPage (app/bills/[id]/get-bill.ts).
 */
import type { Bill } from './types/bill';
import type { HubSortedBy } from './hubs';

export interface HubBills {
  data: Bill[];
  hasMore: boolean;
  sortedBy: HubSortedBy | null;
}

export async function readHubBills(
  hubPath: string,
  reads: {
    sorted: () => Promise<HubBills>;
    unsorted: () => Promise<{ data: Bill[]; hasMore: boolean }>;
  },
): Promise<HubBills> {
  try {
    return await reads.sorted();
  } catch (error) {
    console.error(`Sorted hub read failed for ${hubPath}; showing it unsorted`, error);
    const unsorted = await reads.unsorted();
    return { data: unsorted.data, hasMore: unsorted.hasMore, sortedBy: null };
  }
}
