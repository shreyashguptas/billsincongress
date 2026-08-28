import { TableAggregate } from "@convex-dev/aggregate";
import { componentsGeneric } from "convex/server";
import { DataModel } from "./_generated/dataModel";

// Re-exported so callers (e.g. convex/mutations.ts) keep importing it from here.
export { BILL_STAGES } from "./billStage";

// Component handles. We resolve them via `componentsGeneric()` rather than the
// `_generated/api.ts` re-export so this file typechecks locally without
// requiring `npx convex codegen` to run with credentials. After
// `convex deploy` runs codegen, both forms refer to the same object.
const components = componentsGeneric() as unknown as {
  billsByChamber: any;
  billsByStage: any;
};

/**
 * Stage used when a bill has no `progressStage`. Exported because
 * `convex/functions.ts` needs to compute the exact same sort key this file
 * gives the aggregate — a mismatched fallback there would skip a trigger that
 * should have fired.
 */
export const DEFAULT_STAGE = 20; // "Introduced" — used when progressStage is missing

/**
 * Bills partitioned by `congress`, sorted by `billType`, so chamber counts are
 * O(log n) instead of a table scan. House types start with "h" (hr, hjres,
 * hconres, hres) and Senate types with "s" (s, sjres, sconres, sres), so each
 * chamber is a lexicographic prefix range over this aggregate.
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

// Bills partitioned by `congress`, sorted by `progressStage` — the homepage
// status chart's per-stage breakdown in O(log n).
export const billsByStage = new TableAggregate<{
  Namespace: number;
  Key: number;
  DataModel: DataModel;
  TableName: "bills";
}>(components.billsByStage, {
  namespace: (doc) => doc.congress,
  sortKey: (doc) => doc.progressStage ?? DEFAULT_STAGE,
});

export const HOUSE_BILL_TYPES = ["hr", "hjres", "hconres", "hres"] as const;
export const SENATE_BILL_TYPES = ["s", "sjres", "sconres", "sres"] as const;
