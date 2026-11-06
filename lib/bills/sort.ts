/**
 * The "Sort" menu on /bills: which orders a filter set can be shown in, which
 * one it gets when the reader has not picked, and what each row's date means.
 *
 * Every order is newest first and is one `bills.list` can promise (see
 * `sortedMatches` in convex/bills.ts): a date order is read from an index in
 * that order, or from a set read whole. "Best match" is the title search's own
 * relevance order.
 *
 * The URL carries `sort` only when it differs from the default, so
 * /bills?status=100 already lists the newest laws first.
 */
import type { BillsFilterValues } from '@/app/bills/filter-signature';
import { stageDateLabel } from '@/lib/hubs';
import { JUST_INTRODUCED_STATUS } from './just-introduced';

export type BillsSort = 'relevance' | 'stage' | 'latestAction' | 'introduced';

/** The URL parameter. */
export const SORT_PARAM = 'sort';

const SORTS: ReadonlySet<string> = new Set(['relevance', 'stage', 'latestAction', 'introduced']);

export function isBillsSort(value: string | null | undefined): value is BillsSort {
  return value !== null && value !== undefined && SORTS.has(value);
}

type SortFilters = Pick<BillsFilterValues, 'status' | 'title'>;

/** The orders this filter set offers, in menu order. */
export function sortOptions(f: SortFilters): { value: BillsSort; label: string }[] {
  const stage = stageDateLabel(f.status);
  return [
    ...(f.title.trim() !== '' ? [{ value: 'relevance' as const, label: 'Best match' }] : []),
    ...(stage ? [{ value: 'stage' as const, label: `Date ${lowerFirst(stage)}` }] : []),
    { value: 'latestAction', label: 'Latest action' },
    { value: 'introduced', label: 'Date introduced' },
  ];
}

/**
 * The order a filter set gets when none is picked: a search by how well titles
 * match; an Outcome by when bills reached it (newest laws first); "Just
 * introduced" by introduction; everything else by latest action.
 */
export function defaultSort(f: SortFilters): BillsSort {
  if (f.title.trim() !== '') return 'relevance';
  if (stageDateLabel(f.status)) return 'stage';
  if (f.status === JUST_INTRODUCED_STATUS) return 'introduced';
  return 'latestAction';
}

/** The order actually applied: the reader's pick while this filter set offers it. */
export function effectiveSort(f: SortFilters & { sort: string }): BillsSort {
  return sortOptions(f).some((o) => o.value === f.sort) ? (f.sort as BillsSort) : defaultSort(f);
}

/** The `sort` URL value, or undefined when the order is the default. */
export function sortParamValue(f: SortFilters & { sort: string }): BillsSort | undefined {
  const sort = effectiveSort(f);
  return sort === defaultSort(f) ? undefined : sort;
}

/** The `sort` argument for `bills.list`; relevance is its default for a search. */
export function listSortArg(sort: BillsSort): Exclude<BillsSort, 'relevance'> | undefined {
  return sort === 'relevance' ? undefined : sort;
}

/**
 * The date each row shows under this order, labelled, so the date a reader sees
 * is the one the list is sorted on. Null for "Best match", where rows keep
 * their unlabelled introduced date.
 */
export function sortDateLabel(sort: BillsSort, status: string): string | null {
  if (sort === 'stage') return stageDateLabel(status);
  if (sort === 'latestAction') return 'Latest action';
  if (sort === 'introduced') return 'Introduced';
  return null;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
