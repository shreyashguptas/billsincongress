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
    }

    if (key === "progressStage" && !VALID_STAGES.includes(value as number)) {
      return {
        ok: false,
        error:
          `progressStage must be one of ${VALID_STAGES.join(", ")} — these are stage ` +
          `codes, not percentages. Got ${String(value)}.`,
      };
    }
    if (key === "chamber" && !VALID_CHAMBERS.includes(value as string)) {
      return { ok: false, error: `chamber must be 'house' or 'senate'. Got '${String(value)}'.` };
    }

    out[key] = value;
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
