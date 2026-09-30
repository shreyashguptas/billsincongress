/**
 * Ordered reading for the hub pages' "Newest first" / "Oldest first".
 *
 * Pure (no Convex imports) so it carries a plain unit test. `bills.listSorted`
 * hands it index ranges that are already in order; this module only joins them
 * without breaking that order, so the sort a reader sees is the index's, never
 * a sort of whatever a capped scan happened to read.
 *
 * Undated rows go LAST in both directions. An index puts an absent value before
 * every string, so read ascending it would open "Oldest first" with the bills we
 * know least about. Ascending reads therefore come in three ranges — dated, then
 * "", then absent — and descending reads are already in that shape.
 */

export type HubOrder = "newest" | "oldest";

type Ordered = { _creationTime: number };

/** 0 for a real date, 1 for "", 2 for absent: the tail order in both directions. */
function datedRank(value: string | undefined): number {
  if (value === undefined) return 2;
  return value === "" ? 1 : 0;
}

/**
 * The order an index range on (…prefix, `field`) yields, as a comparator:
 * dated rows by date in the requested direction, then undated ones, with ties
 * broken by `_creationTime` in the same direction — exactly as the index breaks
 * them. Streams merged with this must each already be in this order.
 */
export function compareForOrder<T extends Ordered>(
  order: HubOrder,
  dateOf: (row: T) => string | undefined,
): (a: T, b: T) => number {
  const dir = order === "newest" ? -1 : 1;
  return (a, b) => {
    const da = dateOf(a);
    const db = dateOf(b);
    const rank = datedRank(da) - datedRank(db);
    if (rank !== 0) return rank;
    if (da !== db && da !== undefined && db !== undefined) {
      return (da < db ? -1 : 1) * dir;
    }
    return (a._creationTime - b._creationTime) * dir;
  };
}

/** Each stream in turn. Later streams are not opened until earlier ones end. */
export async function* concatStreams<T>(
  makers: ReadonlyArray<() => AsyncIterable<T>>,
): AsyncGenerator<T> {
  for (const make of makers) yield* make();
}

/**
 * K-way merge of streams that are each sorted by `compare`. Holds one row per
 * stream, so reading n rows costs n reads plus one look-ahead per stream.
 */
export async function* mergeOrdered<T>(
  streams: ReadonlyArray<AsyncIterable<T>>,
  compare: (a: T, b: T) => number,
): AsyncGenerator<T> {
  const iterators = streams.map((s) => s[Symbol.asyncIterator]());
  const heads = await Promise.all(iterators.map((it) => it.next()));
  for (;;) {
    let best = -1;
    for (let i = 0; i < heads.length; i++) {
      const head = heads[i];
      if (head.done) continue;
      const current = heads[best];
      if (best < 0 || (current && !current.done && compare(head.value, current.value) < 0)) {
        best = i;
      }
    }
    if (best < 0) return;
    const winner = heads[best];
    if (winner.done) return;
    yield winner.value;
    heads[best] = await iterators[best].next();
  }
}

/** The first `n` rows of a stream (fewer if it ends). */
export async function takeFirst<T>(stream: AsyncIterable<T>, n: number): Promise<T[]> {
  const rows: T[] = [];
  if (n <= 0) return rows;
  for await (const row of stream) {
    rows.push(row);
    if (rows.length >= n) break;
  }
  return rows;
}
