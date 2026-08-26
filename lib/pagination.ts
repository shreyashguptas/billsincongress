/**
 * Which page numbers to show in a pagination bar.
 *
 * The hub pages cap at 10 pages and list all of them. `/bills` caps at 51,
 * where 51 numbered links is a wall rather than a control — so past a
 * threshold the middle collapses to an ellipsis.
 *
 * Collapsing costs a crawler nothing. The first page, the last page, and the
 * neighbours of the current page are always present, and the bar also carries
 * `rel="prev"`/`rel="next"`, so every page remains reachable by walking the
 * chain one step at a time — which is how a crawler traverses a paginated set
 * anyway.
 */

/** Marks a gap in the sequence, rendered as an unclickable ellipsis. */
export const GAP = 'gap' as const;

export type PaginationSlot = number | typeof GAP;

/** Below this many pages, every number is shown. */
const SHOW_ALL_UP_TO = 12;

/** Pages either side of the current one that stay visible when collapsed. */
const NEIGHBOURS = 1;

/**
 * The slots for a pagination bar: page numbers, with `GAP` where a run was
 * collapsed. Always includes 1, `lastPage`, and `page` itself.
 */
export function paginationWindow(page: number, lastPage: number): PaginationSlot[] {
  if (lastPage < 1) return [];
  if (lastPage <= SHOW_ALL_UP_TO) {
    return Array.from({ length: lastPage }, (_, i) => i + 1);
  }

  const current = Math.min(Math.max(page, 1), lastPage);
  const keep = new Set<number>([1, lastPage, current]);
  for (let d = 1; d <= NEIGHBOURS; d++) {
    if (current - d >= 1) keep.add(current - d);
    if (current + d <= lastPage) keep.add(current + d);
  }

  const sorted = [...keep].sort((a, b) => a - b);
  const slots: PaginationSlot[] = [];
  let previous = 0;
  for (const n of sorted) {
    // A gap of exactly one page is written out rather than hidden behind an
    // ellipsis — "1 … 3" wastes a slot to conceal a single number.
    if (previous && n - previous === 2) slots.push(previous + 1);
    else if (previous && n - previous > 2) slots.push(GAP);
    slots.push(n);
    previous = n;
  }
  return slots;
}

/** Total pages for a result count, clamped to what the backend can serve. */
export function lastPageFor(
  totalItems: number,
  itemsPerPage: number,
  maxPage: number,
): number {
  if (totalItems <= 0 || itemsPerPage <= 0) return 0;
  return Math.min(maxPage, Math.ceil(totalItems / itemsPerPage));
}
