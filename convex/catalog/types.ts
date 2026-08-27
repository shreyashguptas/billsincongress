/**
 * Types for the dataset catalog (spec §4.1).
 *
 * Pure types only — no Convex imports — so datasets.ts stays unit-testable.
 */

export type DatasetName =
  | "bills"
  | "bill_actions"
  | "bill_summaries"
  | "topics"
  | "sponsors"
  | "stats";

export interface FieldDoc {
  name: string;
  type: string;
  /** Plain language. Written for a reader, not a schema browser. */
  meaning: string;
}

export interface FilterDoc {
  name: string;
  type: "string" | "number" | "string[]";
  /** Allowed values, or how to discover them. */
  allowed?: string;
  example?: string;
}

export interface DatasetDoc {
  name: DatasetName;
  /** One line. Goes in the always-present prompt index — keep it short. */
  summary: string;
  /** What one row means. */
  grain: string;
  fields: FieldDoc[];
  filters: FilterDoc[];
  /**
   * Things that cause wrong answers. Each entry here is a class of error that
   * stops happening. This is the highest-value field in the catalog.
   */
  gotchas: string[];
  /** Things a reader might expect that we genuinely do not hold. */
  notCovered: string[];
  examples: string[];
}
