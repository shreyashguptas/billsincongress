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
 */
const triggers = new Triggers<DataModel>();

triggers.register("bills", billsByChamber.trigger());
triggers.register("bills", billsByStage.trigger());

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
