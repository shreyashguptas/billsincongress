/// <reference types="vite/client" />
/**
 * The two writers of `bills.stageDate` — the sync's `upsertBill` and the
 * backfill's `rederiveBillFieldsFromActions` — must clear a date that is no
 * longer true, not only write new ones.
 *
 * After the backfill every Introduced bill is dated by its introduction. If it
 * then moves on through an undated action, its new stage has no date; a writer
 * that only ever set the field left "Passed a chamber · <introduction date>"
 * on the row, sorted by it.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  // Both writers are trigger-wrapped: they keep the chamber and stage counts.
  aggregateTest.register(t, "billsByChamber");
  aggregateTest.register(t, "billsByStage");
  return t;
}

const bill = {
  billId: "1hr119",
  congress: 119,
  billType: "hr",
  billNumber: "1",
  billTypeLabel: "H.R.",
  title: "A bill",
  introducedDate: "2025-01-03",
};

/** The stored date, or "absent" — `t.run` would turn a bare undefined into null. */
async function storedStageDate(t: ReturnType<typeof setup>) {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", bill.billId))
      .unique();
    return row?.stageDate ?? "absent";
  });
}

describe("bills.stageDate writers", () => {
  test("upsertBill clears the date when the new stage has none, and keeps it when not told", async () => {
    const t = setup();
    await t.mutation(internal.mutations.upsertBill, {
      ...bill,
      progressStage: 20,
      progressDescription: "Introduced",
      stageDate: "2025-01-03",
    });
    expect(await storedStageDate(t)).toBe("2025-01-03");

    // The repair path sends no stage fields: the stored date stands.
    await t.mutation(internal.mutations.upsertBill, { ...bill, title: "A renamed bill" });
    expect(await storedStageDate(t)).toBe("2025-01-03");

    // Passed a chamber through an undated action: the sync sends null.
    await t.mutation(internal.mutations.upsertBill, {
      ...bill,
      progressStage: 60,
      progressDescription: "Passed One Chamber",
      stageDate: null,
    });
    expect(await storedStageDate(t)).toBe("absent");
  });

  test("rederiveBillFieldsFromActions clears a date the actions no longer support", async () => {
    const t = setup();
    const id = await t.run(async (ctx) => {
      const id = await ctx.db.insert("bills", {
        ...bill,
        progressStage: 20,
        progressDescription: "Introduced",
        stageDate: "2025-01-03",
        updatedAt: "2025-01-03T00:00:00Z",
      });
      await ctx.db.insert("billActions", { billId: bill.billId, actionDate: "2025-01-03", text: "Introduced in House" });
      await ctx.db.insert("billActions", { billId: bill.billId, actionDate: "", text: "Passed House", type: "PassedHouse" });
      return id;
    });

    await t.mutation(internal.mutations.rederiveBillFieldsFromActions, {
      bills: [
        {
          _id: id,
          billId: bill.billId,
          progressStage: 20,
          progressDescription: "Introduced",
          introducedDate: bill.introducedDate,
          stageDate: "2025-01-03",
        },
      ],
    });
    const row = await t.run(async (ctx) => await ctx.db.get(id));
    expect(row?.progressStage).toBe(60);
    expect(row?.stageDate).toBeUndefined();
  });
});
