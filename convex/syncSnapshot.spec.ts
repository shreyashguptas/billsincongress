/// <reference types="vite/client" />
/**
 * How a sync run's snapshot is closed, which is what the site's
 * "Updated X ago" line (bills.getSyncStatus) reads.
 *
 * Each bill type's chain used to mark the snapshot "completed" itself, and only
 * after a batch that had bills in it. So the Monday incremental, which follows
 * the Sunday full sync and finds every list empty, stayed "running" for ever
 * and readers were told the data was a day older than it was. And each type
 * overwrote the totals with its own: a row read 14 processed of 169 synced.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TYPES = ["hr", "s", "hjres", "sjres", "hconres", "sconres", "hres", "sres"];

function setup() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "billsByChamber");
  aggregateTest.register(t, "billsByStage");
  return t;
}
type T = ReturnType<typeof setup>;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.CONGRESS_API_KEY;
});

const newSnapshot = (t: T) =>
  t.mutation(internal.mutations.createSyncSnapshot, {
    syncType: "incremental",
    congress: 119,
  });

const snapshotRow = (t: T, id: Id<"syncSnapshots">) =>
  t.run(async (ctx) => (await ctx.db.get(id))!);

/** Stand-in Congress.gov: every bill list is empty, except `failing` types, which answer 500. */
function stubCongressGov(failing: string[] = []) {
  process.env.CONGRESS_API_KEY = "test";
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const type = new URL(String(input)).pathname.split("/").at(-1)!;
    if (failing.includes(type)) {
      return new Response("upstream error", { status: 500, statusText: "Internal Server Error" });
    }
    return new Response(JSON.stringify({ bills: [] }), { status: 200 });
  });
}

const runAllTypes = async (t: T, snapshotId: Id<"syncSnapshots">) => {
  for (const billType of TYPES) {
    await t.action(internal.congressApi.syncBillBatch, {
      congress: 119,
      billType,
      offset: 0,
      snapshotId,
    });
  }
};

describe("closing a sync snapshot", () => {
  test("a night on which every bill list is empty is completed, not left running", async () => {
    const t = setup();
    stubCongressGov();
    const snapshotId = await newSnapshot(t);

    await runAllTypes(t, snapshotId);

    const row = await snapshotRow(t, snapshotId);
    expect(row.status).toBe("completed");
    expect(row.completedAt).toBeTruthy();
    expect(row.typesFinished).toHaveLength(8);
    expect(row.typesFailed).toEqual([]);
    expect(await t.query(api.bills.getSyncStatus, {})).toEqual({
      syncType: "incremental",
      completedAt: row.completedAt,
      totalProcessed: 0,
      totalSuccess: 0,
      totalFailed: 0,
    });
  });

  test("a mixed night is closed once, by the last type, with every type's counts summed", async () => {
    const t = setup();
    const snapshotId = await newSnapshot(t);
    // `billsSynced` as syncBillBatch passes it: the offset reached plus the last batch's successes.
    const finish = (
      billType: string,
      batch?: { processed: number; success: number; failed: number },
      offset = 0,
    ) =>
      t.mutation(internal.mutations.finishSyncType, {
        snapshotId,
        billType,
        billsSynced: offset + (batch?.success ?? 0),
        typeCount: TYPES.length,
        batch,
      });

    // hr: one full batch, then a short last one. s: a single short batch.
    await t.mutation(internal.mutations.recordSyncBatch, {
      snapshotId,
      processed: 50,
      success: 48,
      failed: 2,
    });
    await finish("hr", { processed: 10, success: 10, failed: 0 }, 50);
    // The first type with bills to finish used to mark the run completed with
    // only its own counts.
    expect((await snapshotRow(t, snapshotId)).status).toBe("running");
    await finish("s", { processed: 5, success: 5, failed: 0 });
    for (const billType of TYPES.slice(2, -1)) await finish(billType);
    expect((await snapshotRow(t, snapshotId)).status).toBe("running");
    expect(await t.query(api.bills.getSyncStatus, {})).toBeNull();

    // billsSynced (which decides the rollup recount) counts hr's whole first
    // page by offset; the totals count its two failures as failures.
    expect(await finish("sres")).toEqual({ last: true, billsSynced: 65 });

    const row = await snapshotRow(t, snapshotId);
    expect(row.status).toBe("completed");
    expect(row).toMatchObject({ totalProcessed: 65, totalSuccess: 63, totalFailed: 2 });
    const completedAt = row.completedAt;

    // A late duplicate finish neither re-closes nor re-counts.
    expect((await finish("hr", { processed: 9, success: 9, failed: 0 })).last).toBe(false);
    expect(await snapshotRow(t, snapshotId)).toMatchObject({
      completedAt,
      totalProcessed: 65,
    });
  });

  test("a type whose list fetch fails closes the run as failed, and the last good run still shows", async () => {
    const t = setup();
    stubCongressGov();
    const goodId = await newSnapshot(t);
    await runAllTypes(t, goodId);
    const good = await snapshotRow(t, goodId);

    stubCongressGov(["s"]);
    const badId = await newSnapshot(t);
    await runAllTypes(t, badId);

    const bad = await snapshotRow(t, badId);
    expect(bad.status).toBe("failed");
    expect(bad.completedAt).toBeTruthy();
    expect(bad.typesFinished).toHaveLength(8);
    expect(bad.typesFailed).toEqual(["s"]);
    expect(bad.errorDetails).toContain("s: Bill list fetch failed at offset 0: API error 500");

    // "Updated X ago" names the last run that checked every type.
    expect((await t.query(api.bills.getSyncStatus, {}))?.completedAt).toBe(good.completedAt);
  });

  test("with only failed runs there is no sync status, so the line is not shown", async () => {
    const t = setup();
    stubCongressGov(TYPES);
    const snapshotId = await newSnapshot(t);
    await runAllTypes(t, snapshotId);
    expect((await snapshotRow(t, snapshotId)).status).toBe("failed");
    expect(await t.query(api.bills.getSyncStatus, {})).toBeNull();
  });
});
