'use client';

import { billsService, type SponsorOption } from '@/lib/services/bills-service';

/**
 * The sponsor list, fetched once per page session and only when someone opens
 * the sponsor picker.
 *
 * It used to load on every /bills visit, because the combobox that needed it
 * was always mounted — roughly 780 rows of network and parse for a control most
 * readers never touch.
 *
 * The promise is memoised rather than the result, so two pickers opening in the
 * same tick share one request. A rejection clears the memo, so Retry actually
 * retries instead of handing back the same failed promise forever.
 */
let pending: Promise<SponsorOption[]> | null = null;

export function loadSponsors(): Promise<SponsorOption[]> {
  if (!pending) {
    pending = billsService.fetchAllSponsors().catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}
