import { Triggers } from "convex-helpers/server/triggers";
import {
  customCtx,
  customMutation,
} from "convex-helpers/server/customFunctions";
import { DataModel } from "./_generated/dataModel";
import {
  internalMutation as rawInternalMutation,
  mutation as rawMutation,
} from "./_generated/server";
import { billsByChamber, billsByStage } from "./aggregates";

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

triggers.register("bills", billsByChamber.idempotentTrigger());
triggers.register("bills", billsByStage.idempotentTrigger());

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
