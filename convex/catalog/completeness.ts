/**
 * The completeness contract (the spine of answer accuracy).
 *
 * READ THIS BEFORE CHANGING ANY FETCH HANDLER.
 *
 * Every defect in the 2026-08-30 accuracy audit was the same mistake wearing
 * different clothes: we handed the model a PAGE — capped, filtered after the
 * fact, in arbitrary order — and then let it answer questions whose answers are
 * properties of the whole SET. "How many", "which is most recent", "who has the
 * fewest", "are there any" are set-level claims, and a page cannot support one.
 *
 * Concretely, this shipped to readers:
 *   - "104 House bills became law" (it is 64; 104 is both chambers)
 *   - "Tom McClintock introduced the fewest bills in California" (it is James
 *     Gallagher; 25 of California's 54 members were invisible), and the model
 *     justified it out loud with "truncated: false ... meaning all matching rows
 *     were returned"
 *   - "We don't have data on Texas bills that became law" (eleven have)
 *
 * The old vocabulary caused this. `truncated` described the ROWS, not the SET;
 * `count` was whatever survived an in-memory filter over a capped window; and
 * `total_is_at_least: 0` read as "none exist". So all three are gone. A handler
 * now says what set its rows represent, whether it read all of it, and in what
 * order — and a total is emitted ONLY when the set was read completely.
 *
 * The rule the prompt enforces on top of this: set-level claims (counts,
 * superlatives, rankings, averages, "none", "the only") may be made ONLY over a
 * result with complete: true. That is the whole design.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */

/**
 * How the rows are ordered. `arbitrary` is the honest default and must stay the
 * default: Convex returns index order, which after an eq() prefix is insertion
 * order, and the model has repeatedly asserted a date sort that did not exist —
 * once naming a "most recent" bill while a later row in its own result carried a
 * later date. Anything that is not a guaranteed sort says so.
 */
export type RowOrder =
  | "arbitrary"
  | "newest_action_first"
  | "oldest_action_first"
  | "newest_introduced_first"
  | "oldest_introduced_first"
  | "most_bills_first"
  | "fewest_bills_first"
  | "chronological"
  | "newest_first"
  | "largest_first";

/** Human-readable, model-facing description of the order, keyed by RowOrder. */
const ORDER_PROSE: Record<RowOrder, string> = {
  arbitrary:
    "NOT SORTED. Row position means nothing. Never take the first or last row as the largest, " +
    "smallest, newest or oldest, and never derive a maximum or minimum from these rows.",
  newest_action_first: "Sorted by most recent action, newest first.",
  oldest_action_first: "Sorted by most recent action, oldest first.",
  newest_introduced_first: "Sorted by introduction date, newest first.",
  oldest_introduced_first: "Sorted by introduction date, oldest first.",
  most_bills_first: "Sorted by number of bills introduced, highest first.",
  fewest_bills_first: "Sorted by number of bills introduced, LOWEST first.",
  chronological: "In the order the events actually happened, earliest first.",
  newest_first: "Sorted newest first.",
  largest_first: "Sorted by size, largest first.",
};

export interface CompletenessReport {
  /**
   * Plain-English description of the SET the rows are drawn from, e.g.
   * "every bill in the 119th Congress with policy area Health that became law".
   * Written for the model, and the thing it must reason about instead of the
   * rows in front of it.
   */
  set: string;
  /** True only when every row matching the filters was examined. */
  complete: boolean;
  /** Size of the set. Present ONLY when complete — see `payloadFor`. */
  total?: number;
  /** How many rows were actually returned. */
  shown: number;
  order: RowOrder;
  /**
   * True when an INDEX produced the order, so the rows really are the first N of
   * the whole set — even if we never counted it.
   *
   * This is the difference between "we cannot tell you how many" and "we cannot
   * tell you which is newest". Without it, "what is the most recent bill?" over
   * the 18,476 measures of a Congress was refused outright: the set is too big to
   * count, so the sort was refused too, and a perfectly answerable question got
   * nothing. Reading an ordering index answers it exactly while leaving the total
   * honestly unknown.
   */
  orderFromIndex?: boolean;
  /** Present only when incomplete: what was and was not read. */
  note?: string;
}

/** Written FOR THE MODEL — pasted into the tool result verbatim. */
const INCOMPLETE_NOTE =
  "INCOMPLETE RESULT. We did not read every row matching these filters, so there is no total " +
  "and there can be no count. An empty or small result here is NOT evidence that few or none " +
  "exist — the rows you cannot see may be exactly the ones you are looking for. Do NOT state a " +
  "number, do NOT say 'none' or 'no results' or 'we have no data on that', and do NOT claim any " +
  "row here is the largest, smallest, newest, oldest, first or last of anything. Either narrow " +
  "the filters until the result comes back complete, use a dataset that reports exact totals, " +
  "or tell the reader plainly which part of their question you could not answer.";

/**
 * Build the report for a handler that read a bounded window.
 *
 * `windowFilled` means the read hit its ceiling, so rows exist that were never
 * examined. `filteredInMemory` means filters were applied to that window that the
 * index did not enforce — which is what makes a zero meaningless rather than
 * merely approximate.
 */
export function reportFor(input: {
  set: string;
  windowFilled: boolean;
  filteredInMemory: boolean;
  matchedCount: number;
  shown: number;
  order: RowOrder;
  /** An index produced the order, so the rows are the true first N of the set. */
  orderFromIndex?: boolean;
}): CompletenessReport {
  const complete = !input.windowFilled;
  if (complete) {
    return {
      set: input.set,
      complete: true,
      total: input.matchedCount,
      shown: input.shown,
      order: input.order,
      ...(input.orderFromIndex ? { orderFromIndex: true } : {}),
    };
  }
  return {
    set: input.set,
    complete: false,
    shown: input.shown,
    order: input.order,
    ...(input.orderFromIndex ? { orderFromIndex: true } : {}),
    note: input.filteredInMemory
      ? INCOMPLETE_NOTE +
        " (These filters have no index, so an ARBITRARY sample was examined — ordered by when we " +
        "synced each row, which has nothing to do with dates, size or importance — and the rest " +
        "of your filters were applied to that sample. Do not assume the rows you cannot see are " +
        "the older or less relevant ones.)"
      : INCOMPLETE_NOTE,
  };
}

/** For handlers that genuinely read their entire result set. */
export function completeReport(input: {
  set: string;
  total: number;
  shown: number;
  order: RowOrder;
}): CompletenessReport {
  return {
    set: input.set,
    complete: true,
    total: input.total,
    shown: input.shown,
    order: input.order,
  };
}

/**
 * The tool result the model sees.
 *
 * `total` is present if and only if `complete` is true. That is not a style
 * choice — an incomplete result that still carries a number is precisely the
 * shape that produced "104 House bills became law" and "no Texas bills became
 * law". If there is no defensible total, the model must be given no number to
 * reach for.
 */
export function payloadFor(rows: unknown[], report: CompletenessReport): string {
  const payload: Record<string, unknown> = {
    rows,
    set: report.set,
    complete: report.complete,
    shown: report.shown,
    order: report.order,
    order_meaning: ORDER_PROSE[report.order],
  };
  if (report.complete) {
    payload.total = report.total;
    if ((report.total ?? 0) > report.shown) {
      payload.rows_are_a_sample_of_a_known_total =
        `You were shown ${report.shown} of ${report.total}. The TOTAL is exact and you may state ` +
        `it. The ROWS are a page: do not describe them as the whole set, and do not rank or ` +
        `compare across the set using only these rows.`;
    }
  } else {
    payload.note = report.note;
  }
  if (report.orderFromIndex && report.shown > 0) {
    payload.rows_are_the_true_first_rows =
      `The database returned these rows IN THIS ORDER, so they really are the first of the whole ` +
      `set — row 1 is genuinely the ${report.order.replace(/_/g, " ")}. You may say so, and you ` +
      `may rank the rows you can see against each other. You still may NOT state how many there ` +
      `are unless a total is given above.`;
  }
  return JSON.stringify(payload);
}

/**
 * The line the reader sees in the visible work log.
 *
 * The reader was previously shown "sponsors · 29 matches" for a search that had
 * examined a fraction of the set — an audited-looking number behind a wrong
 * answer. When we do not have a total, the reader is told that, not given a
 * number that happens to be in scope.
 */
export function workLogLabel(report: CompletenessReport): string {
  if (!report.complete) return "partial results — no count available";
  const n = report.total ?? 0;
  return `${n} match${n === 1 ? "" : "es"}`;
}
