/**
 * The URL is the single source of truth for /bills filters, so these two
 * functions have to be exact inverses of each other.
 *
 * They used to be two hand-maintained lists of ten fields living inside
 * `bills-client.tsx`, next to a third hand-maintained list in `page.tsx` that
 * parsed the same parameters server-side. Adding a filter meant editing all
 * three; `chamber` was added to the service and to Convex and to none of them,
 * so it silently did not exist.
 *
 * Both are now generated from `FILTERS`, which makes being inverses structural
 * rather than a matter of remembering. `lib/bills/filter-registry.test.ts`
 * asserts the round trip for every filter, including the awkward values —
 * sponsor names containing commas, titles containing `&` and `=`.
 *
 * Filters are deliberately NOT persisted to browser storage: silently
 * re-applying a previous visit's filters produced an unexplained "No bills
 * found" for 358 people a month.
 */
import {
  DEFAULT_FILTER_VALUES,
  type BillsFilterValues,
} from '@/app/bills/filter-signature';
import { FILTERS } from './filter-registry';

/**
 * Serialise a filter set into a query string, omitting anything still at its
 * default. `page` is never emitted — any filter change resets to page 1.
 */
export function buildFilterQuery(f: BillsFilterValues): string {
  const p = new URLSearchParams();
  for (const definition of FILTERS) {
    const value = f[definition.field];
    if (Array.isArray(value)) {
      for (const v of value) if (v !== '') p.append(definition.param, v);
    } else if (value !== '' && value !== 'all') {
      p.set(definition.param, value);
    }
  }
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

/** Inverse of `buildFilterQuery` — used on back/forward navigation. */
export function filtersFromQuery(search: string): BillsFilterValues {
  const p = new URLSearchParams(search);
  const out = { ...DEFAULT_FILTER_VALUES };
  for (const definition of FILTERS) {
    if (definition.multi) {
      // De-duplicated: ?sponsor=A&sponsor=A must not filter on A twice, which
      // would show as "2 sponsors" on the pill.
      const values = Array.from(
        new Set(p.getAll(definition.param).filter((s) => s !== '')),
      );
      (out[definition.field] as string[]) = values;
    } else {
      const raw = p.get(definition.param);
      if (raw !== null && raw !== '') {
        (out[definition.field] as string) = raw;
      }
    }
  }
  return out;
}
