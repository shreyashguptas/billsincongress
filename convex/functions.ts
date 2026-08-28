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
 * Triggers that keep the bill aggregates in sync with the `bills` table: any
 * mutation importing `internalMutation` / `mutation` from this module (rather
 * than from `_generated/server`) fires them transactionally on every bills
 * insert / patch / replace / delete. `idempotentTrigger()` is used so writes
 * survive temporarily out-of-sync aggregates (e.g. a sync between deploy and
 * the one-time `aggregateBackfill:run`).
 */
const triggers = new Triggers<DataModel>();

type BillsCtx = GenericMutationCtx<DataModel>;
type BillsTrigger = Trigger<BillsCtx, DataModel, "bills">;

/**
 * These MUST mirror the `namespace` / `sortKey` functions in aggregates.ts
 * exactly — if they drift, a genuine key change gets skipped below and the
 * aggregate silently goes wrong. That's why DEFAULT_STAGE is imported, not
 * repeated.
 */
const chamberKey = (doc: Doc<"bills">) => `${doc.congress}:${doc.billType}`;
const stageKey = (doc: Doc<"bills">) =>
  `${doc.congress}:${doc.progressStage ?? DEFAULT_STAGE}`;

/**
 * Fire `inner` only when the aggregate's key actually changed. The component's
 * `replaceOrInsert` is an unconditional delete-then-insert on the btree, so a
 * patch touching only fields the aggregates don't key on still rewrites btree
 * paths — the source of "retried due to write conflicts in table btreeNode".
 *
 * Skipping is exactly equivalent, not an approximation: neither aggregate
 * defines a `sumValue`, so an unchanged namespace + sortKey means the deleted
 * and re-inserted entries are identical. Inserts and deletes always fire.
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

export const internalMutation = customMutation(
  rawInternalMutation,
  customCtx(triggers.wrapDB),
);

export const mutation = customMutation(
  rawMutation,
  customCtx(triggers.wrapDB),
);
