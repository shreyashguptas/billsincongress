/**
 * Validate model-supplied filters against a dataset's declared filters
 * (spec §4.4).
 *
 * Every rejection returns a message written FOR THE MODEL: it names what was
 * wrong and what would be right, so the next tool call can succeed. Returning
 * an empty result set instead would read as "nothing matches", which turns a
 * typo into a confident falsehood.
 *
 * Pure module (no Convex imports) so it carries unit tests.
 */
import { DATASETS } from "./datasets";
import type { DatasetName } from "./types";

/**
 * 85 (vetoed) belongs here: it is real stored data (13 bills in the 118th, 2 in
 * the 119th) and the site has a /bills/vetoed hub. Omitting it meant the answer
 * engine REFUSED any question about vetoed bills — a filter the site itself
 * offers must be one the assistant can use.
 *
 * Mirrored by CATALOG_STAGES in `lib/answer-scope.ts`, which builds the scopes
 * that arrive here; `lib/answer-scope.test.ts` asserts the two lists match, so
 * the omission cannot come back on one side only. The reader-facing symptom was
 * silent: "Ask about these" on a vetoed list still produced an answer, about
 * every bill in the Congress, under a heading promising otherwise.
 */
export const VALID_STAGES = [20, 40, 60, 80, 85, 90, 95, 100];
const VALID_CHAMBERS = ["house", "senate"];
/**
 * Sorts the `bills` dataset understands. Without these the engine had no
 * ordering at all: it read rows in insertion order and then asserted a date sort
 * that did not exist, once naming the third-most-recent law as the most recent
 * while the true answer was not even on the page it had been given.
 */
export const VALID_SORTS = [
  "newest_action",
  "oldest_action",
  "newest_introduced",
  "oldest_introduced",
];
/**
 * Sorts the `sponsors` dataset understands.
 *
 * `fewest_bills` exists because "who introduced the fewest bills in California"
 * was unanswerable at any page size: the read was complete and the total exact,
 * but the 50-row page was ordered most-first, so the four lowest — including the
 * real answer — were never on it.
 */
export const VALID_SPONSOR_SORTS = ["most_bills", "fewest_bills"];
/** ISO calendar dates only. Anything looser invites a silent mismatch. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_FILTERS = ["introducedAfter", "introducedBefore", "actionAfter", "actionBefore"];
/** Datasets whose handler cannot run without a specific row identified. */
const REQUIRED: Partial<Record<DatasetName, string[]>> = {
  bill_actions: ["billId"],
  bill_summaries: ["billId"],
};

export type ValidationResult =
  | { ok: true; filters: Record<string, unknown> }
  | { ok: false; error: string };

export function validateFilters(name: DatasetName, raw: unknown): ValidationResult {
  const doc = DATASETS[name];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `filters must be an object. Example: ${doc.examples[0]}` };
  }

  const input = raw as Record<string, unknown>;
  const declared = new Map(doc.filters.map((f) => [f.name, f]));
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;

    const spec = declared.get(key);
    if (!spec) {
      return {
        ok: false,
        error:
          `'${key}' is not a filter on '${name}'. Valid filters: ` +
          `${[...declared.keys()].join(", ")}. Call describe_dataset('${name}') for details.`,
      };
    }

    if (spec.type === "number" && typeof value !== "number") {
      return { ok: false, error: `'${key}' must be a number, got ${typeof value}.` };
    }
    if (spec.type === "string" && typeof value !== "string") {
      return { ok: false, error: `'${key}' must be a string, got ${typeof value}.` };
    }
    if (spec.type === "string[]") {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        return { ok: false, error: `'${key}' must be an array of strings, e.g. ${spec.example}.` };
      }
      // An empty list is a malformed call, not "no filter". Silently ignoring it
      // was worse: `{progressStage:100, sponsorFilter:[]}` rejected every row in
      // memory and reported an exact, complete total of 0 against a truth of 104.
      if (value.length === 0) {
        return {
          ok: false,
          error:
            `'${key}' was an empty list. Either name at least one, e.g. ${spec.example}, or ` +
            `leave the filter out entirely. An empty list is not "everyone".`,
        };
      }
    }

    if (key === "progressStage" && !VALID_STAGES.includes(value as number)) {
      return {
        ok: false,
        error:
          `progressStage must be one of ${VALID_STAGES.join(", ")} — these are stage ` +
          `codes, not percentages. Got ${String(value)}.`,
      };
    }
    if (key === "reachedStage" && !VALID_STAGES.includes(value as number)) {
      return {
        ok: false,
        error:
          `reachedStage must be one of ${VALID_STAGES.join(", ")}. It means 'got AT LEAST this ` +
          `far', so it includes bills that went further — use it for milestone questions like ` +
          `'how many passed the Senate'. Got ${String(value)}.`,
      };
    }
    if (key === "chamber" && !VALID_CHAMBERS.includes(value as string)) {
      return { ok: false, error: `chamber must be 'house' or 'senate'. Got '${String(value)}'.` };
    }
    if (key === "sort") {
      const allowed = name === "sponsors" ? VALID_SPONSOR_SORTS : VALID_SORTS;
      if (!allowed.includes(value as string)) {
        return {
          ok: false,
          error: `sort on '${name}' must be one of ${allowed.join(", ")}. Got '${String(value)}'.`,
        };
      }
    }
    if (DATE_FILTERS.includes(key) && !ISO_DATE.test(String(value))) {
      return {
        ok: false,
        error: `${key} must be an ISO date like 2026-01-31. Got '${String(value)}'.`,
      };
    }

    out[key] = value;
  }

  // These two answer different questions and combining them is always a mistake:
  // progressStage is where a bill STOPPED, reachedStage is how far it GOT. Asking
  // for both means asking for bills that stopped at 60 and also went past it.
  if (out.progressStage !== undefined && out.reachedStage !== undefined) {
    return {
      ok: false,
      error:
        "Use progressStage OR reachedStage, not both. progressStage is where a bill ENDED UP " +
        "(mutually exclusive buckets). reachedStage means 'got at least this far' and includes " +
        "everything that went further — that is the one you want for 'how many passed the Senate'.",
    };
  }

  for (const required of REQUIRED[name] ?? []) {
    if (out[required] === undefined) {
      return {
        ok: false,
        error: `'${name}' requires '${required}'. Look the bill up in 'bills' first to get its billId.`,
      };
    }
  }

  return { ok: true, filters: out };
}
