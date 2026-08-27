import { Triggers, type Trigger } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import type { GenericMutationCtx } from "convex/server";
import { DataModel, Doc } from "./_generated/dataModel";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "./_generated/server";
import { billsByChamber, billsByStage, DEFAULT_STAGE } from "./aggregates";

/**
 * Triggers that keep the bill aggregates in sync with the `bills` table.
 *
 * Any mutation that uses `internalMutation` / `mutation` from this module
 * (rather than directly from `_generated/server`) will run these triggers
 * transactionally on every insert / patch / replace / delete to `bills`.
 *
 * We use `idempotentTrigger()` (which calls `insertIfDoesNotExist` /
 * `replaceOrInsert` / `deleteIfExists` internally) so that writes survive
 * temporary out-of-sync states — e.g. a sync running between deploy and the
 * one-time `aggregateBackfill:run`, or a repair run that touches bills the
 * backfill hasn't reached yet. It's essentially free to use permanently.
 */
const triggers = new Triggers<DataModel>();

type BillsCtx = GenericMutationCtx<DataModel>;
type BillsTrigger = Trigger<BillsCtx, DataModel, "bills">;

/**
 * The (namespace, sortKey) pair each aggregate stores for a bill, flattened to
 * a comparable string. These MUST mirror the `namespace` / `sortKey` functions
 * in aggregates.ts exactly — if they drift, a genuine key change gets skipped
 * below and the aggregate silently goes wrong. That's why DEFAULT_STAGE is
 * imported rather than repeated.
 */
const chamberKey = (doc: Doc<"bills">) => `${doc.congress}:${doc.billType}`;
const stageKey = (doc: Doc<"bills">) =>
  `${doc.congress}:${doc.progressStage ?? DEFAULT_STAGE}`;

/**
 * Fire `inner` only when the aggregate's key actually changed.
 *
 * The component's `replaceOrInsert` is an unconditional delete-then-insert on
 * the btree — it never checks whether the key moved. So a patch touching only
 * `syncedEndpoints`, `latestActionDate` or `policyAreaName` still rewrites a
 * whole path of btree nodes, twice (once per aggregate). A single bill going
 * through syncSingleBill is patched up to five times and at most one of those
 * can move a key, so most of that btree traffic is waste — and it is what puts
 * updateBillSyncStatus / upsertBillActions / upsertBillSubject into Convex's
 * "retried due to write conflicts in table btreeNode" health insights.
 *
 * Skipping is exactly equivalent, not an approximation: neither aggregate
 * defines a `sumValue`, so an unchanged namespace + sortKey means the entry
 * that would be deleted and the one re-inserted are identical. Inserts and
 * deletes always fire.
 */
function onKeyChange(
  inner: BillsTrigger,
  keyOf: (doc: Doc<"bills">) => string,
): BillsTrigger {
  return async (ctx, change) => {
    if (
      change.operation === "update" &&
      keyOf(change.oldDoc) === keyOf(change.newDoc)
    ) {
      return;
    }
    await inner(ctx, change);
  };
}

triggers.register(
  "bills",
  onKeyChange(billsByChamber.idempotentTrigger<BillsCtx>(), chamberKey),
);
triggers.register(
  "bills",
  onKeyChange(billsByStage.idempotentTrigger<BillsCtx>(), stageKey),
);

/** Drop-in replacement for `internalMutation` that fires bill triggers. */
export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);

/** Drop-in replacement for `mutation` that fires bill triggers. */
export const mutation = customMutation(
  rawMutation,
  customCtx(triggers.wrapDB),
);
