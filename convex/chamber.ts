/**
 * Mapping bill types to their originating chamber.
 *
 * Pure module (no imports) so it can carry unit tests. The single assumption it
 * encodes — every Senate type starts with "s" and every House type with "h" —
 * is load-bearing in two different ways, which is why it is tested rather than
 * inlined:
 *
 *   1. `chamberOf` decides which chamber a bill belongs to when filtering.
 *   2. `chamberBounds` turns the same rule into a key range over the
 *      `billsByChamber` aggregate, which is where the exact chamber counts come
 *      from. If a new bill type ever broke the prefix rule, the counts would be
 *      silently wrong rather than failing loudly.
 */

export type Chamber = "house" | "senate";

/** Every bill type Congress issues, as stored in `bills.billType`. */
export const HOUSE_BILL_TYPES = ["hr", "hres", "hjres", "hconres"] as const;
export const SENATE_BILL_TYPES = ["s", "sres", "sjres", "sconres"] as const;
export const ALL_BILL_TYPES = [
  ...HOUSE_BILL_TYPES,
  ...SENATE_BILL_TYPES,
] as const;

/** Originating chamber of a bill, from its type prefix. */
export function chamberOf(billType: string): Chamber {
  return billType.startsWith("s") ? "senate" : "house";
}

export interface ChamberBounds {
  lower: { key: string; inclusive: boolean };
  upper: { key: string; inclusive: boolean };
}

/**
 * Aggregate key bounds covering every bill type in one chamber.
 *
 * The aggregate is keyed by billType, so a prefix range is exactly the chamber:
 * "i" is the letter after "h", and "t" the letter after "s", so each range holds
 * every type starting with that letter and nothing else.
 */
export function chamberBounds(chamber: Chamber): ChamberBounds {
  return chamber === "house"
    ? {
        lower: { key: "h", inclusive: true },
        upper: { key: "i", inclusive: false },
      }
    : {
        lower: { key: "s", inclusive: true },
        upper: { key: "t", inclusive: false },
      };
}

/** Whether a bill type falls inside the given bounds. Mirrors the aggregate. */
export function withinBounds(billType: string, bounds: ChamberBounds): boolean {
  const aboveLower = bounds.lower.inclusive
    ? billType >= bounds.lower.key
    : billType > bounds.lower.key;
  const belowUpper = bounds.upper.inclusive
    ? billType <= bounds.upper.key
    : billType < bounds.upper.key;
  return aboveLower && belowUpper;
}
