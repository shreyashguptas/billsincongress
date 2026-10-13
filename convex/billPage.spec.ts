/// <reference types="vite/client" />
/**
 * The bill page's one query, and the sync's one recount.
 *
 * A bill page used to make two Convex calls that each read the bill, and the
 * second read every topic row of the bill's Congress to use one of them. Nearly
 * every bill page is rendered for a crawler, so that was most of the site's
 * database bill. And each bill type's sync chain recounted the whole Congress
 * as it finished: eight scans a night where one does.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "billsByChamber");
  aggregateTest.register(t, "billsByStage");
  return t;
}

async function addBill(t: ReturnType<typeof setup>, policyAreaName: string | undefined) {
  await t.mutation(internal.mutations.upsertBill, {
    billId: "1hr119",
    congress: 119,
    billType: "hr",
    billNumber: "1",
    billTypeLabel: "H.R.",
    title: "A bill",
    introducedDate: "2025-01-03",
    sponsorFirstName: "Ada",
    sponsorLastName: "Lovelace",
    sponsorParty: "D",
    sponsorState: "CA",
  });
  await t.run(async (ctx) => {
    const bill = await ctx.db
      .query("bills")
      .withIndex("by_billId", (q) => q.eq("billId", "1hr119"))
      .unique();
    await ctx.db.patch(bill!._id, { policyAreaName });
  });
}

const HEALTH = {
  policyAreaName: "Health",
  count: 3,
  stageCounts: [
    { stage: 20, count: 2 },
    { stage: 100, count: 1 },
  ],
};
const TAXATION = {
  policyAreaName: "Taxation",
  count: 5,
  stageCounts: [{ stage: 20, count: 5 }],
};

describe("bills.getPage", () => {
  test("returns the bill as getById does, with the peers of its own topic", async () => {
    const t = setup();
    await addBill(t, "Health");
    await t.mutation(internal.mutations.writeCongressPolicyAreas, {
      congress: 119,
      areas: [TAXATION, HEALTH],
      countedAt: "2026-02-01T00:00:00Z",
    });

    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    const byId = await t.query(api.bills.getById, { billId: "1hr119" });

    expect(page).not.toBeNull();
    expect(page!.bill).toEqual(byId);
    expect(page!.extras.peers).toEqual({
      policyArea: "Health",
      total: 3,
      stageCounts: HEALTH.stageCounts,
      countedAt: "2026-02-01T00:00:00Z",
    });
    expect(page!.extras.billUpdatedAt).toBe(byId!.updatedAt);
  });

  test("draws no peers when the topic has no row in this Congress", async () => {
    const t = setup();
    await addBill(t, "Health");
    await t.mutation(internal.mutations.writeCongressPolicyAreas, {
      congress: 119,
      areas: [TAXATION],
      countedAt: "2026-02-01T00:00:00Z",
    });
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    expect(page!.extras.peers).toBeNull();
  });

  test("draws no peers when the parts do not sum to the topic's total", async () => {
    const t = setup();
    await addBill(t, "Health");
    await t.mutation(internal.mutations.writeCongressPolicyAreas, {
      congress: 119,
      areas: [{ ...HEALTH, count: 4 }],
      countedAt: "2026-02-01T00:00:00Z",
    });
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    expect(page!.extras.peers).toBeNull();
  });

  test("is null for a bill that does not exist", async () => {
    const t = setup();
    expect(await t.query(api.bills.getPage, { billId: "999hr119" })).toBeNull();
  });
});

describe("mutations.finishSyncType", () => {
  const TYPES = ["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"];

  test("only the type that ends last is told to recount, once", async () => {
    const t = setup();
    const snapshotId = await t.mutation(internal.mutations.createSyncSnapshot, {
      syncType: "incremental",
      congress: 119,
    });
    const finish = (billType: string, billsSynced: number) =>
      t.mutation(internal.mutations.finishSyncType, {
        snapshotId,
        billType,
        billsSynced,
        typeCount: TYPES.length,
      });

    for (const billType of TYPES.slice(0, -1)) {
      expect((await finish(billType, 2)).last).toBe(false);
    }
    // A chain that ends twice (a reschedule after a pause) is counted once.
    expect((await finish("hr", 2)).last).toBe(false);

    const last = await finish("sres", 0);
    expect(last).toEqual({ last: true, billsSynced: 14 });

    // Nothing after the last type can trigger a second recount.
    expect((await finish("sres", 0)).last).toBe(false);
    expect((await finish("hr", 5)).last).toBe(false);
  });

  test("reports a quiet night as zero bills synced", async () => {
    const t = setup();
    const snapshotId = await t.mutation(internal.mutations.createSyncSnapshot, {
      syncType: "incremental",
      congress: 119,
    });
    let result = { last: false, billsSynced: -1 };
    for (const billType of TYPES) {
      result = await t.mutation(internal.mutations.finishSyncType, {
        snapshotId,
        billType,
        billsSynced: 0,
        typeCount: TYPES.length,
      });
    }
    expect(result).toEqual({ last: true, billsSynced: 0 });
  });
});
