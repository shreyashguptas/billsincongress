import { TableAggregate } from "@convex-dev/aggregate";
import { componentsGeneric } from "convex/server";
import { DataModel } from "./_generated/dataModel";

// Component handles. We resolve them via `componentsGeneric()` rather than the
// `_generated/api.ts` re-export so this file typechecks locally without
// requiring `npx convex codegen` to run with credentials. After
// `convex deploy` runs codegen, both forms refer to the same object.
const components = componentsGeneric() as unknown as {
  billsByChamber: any;
  billsByStage: any;
};

const DEFAULT_STAGE = 20; // "Introduced" — used when progressStage is missing

/**
 * Aggregate over the `bills` table partitioned by `congress`, sorted by
 * `billType`. Lets us compute totalCount/houseCount/senateCount per congress
 * in O(log n) without scanning the table.
 *
 * House bill types start with "h" (hr, hjres, hconres, hres) and Senate bill
 * types start with "s" (s, sjres, sconres, sres). We use `prefix: ["h"]` and
 * `prefix: ["s"]` ranges via lexicographic bounds to slice the aggregate.
 */
export const billsByChamber = new TableAggregate<{
  Namespace: number;
  Key: string;
  DataModel: DataModel;
  TableName: "bills";
}>(components.billsByChamber, {
  namespace: (doc) => doc.congress,
  sortKey: (doc) => doc.billType,
});

/**
 * Aggregate over the `bills` table partitioned by `congress`, sorted by
 * `progressStage`. Lets us compute the per-stage breakdown for the homepage
 * status chart in O(log n).
 */
export const billsByStage = new TableAggregate<{
  Namespace: number;
  Key: number;
  DataModel: DataModel;
  TableName: "bills";
}>(components.billsByStage, {
  namespace: (doc) => doc.congress,
  sortKey: (doc) => doc.progressStage ?? DEFAULT_STAGE,
});

/**
 * Bill stages that appear on the homepage status chart. Order matters here —
 * it controls the sort order of the chart segments.
 */
export const BILL_STAGES: ReadonlyArray<{ stage: number; description: string }> =
  [
    { stage: 20, description: "Introduced" },
    { stage: 40, description: "In Committee" },
    { stage: 60, description: "Passed One Chamber" },
    { stage: 80, description: "Passed Both Chambers" },
    { stage: 85, description: "Vetoed" },
    { stage: 90, description: "To President" },
    { stage: 95, description: "Signed by President" },
    { stage: 100, description: "Became Law" },
  ];

/**
 * Bill type prefixes for each chamber. Used to derive house/senate counts
 * from `billsByChamber` via lexicographic prefix bounds.
 */
export const HOUSE_BILL_TYPES = ["hr", "hjres", "hconres", "hres"] as const;
export const SENATE_BILL_TYPES = ["s", "sjres", "sconres", "sres"] as const;
