/// <reference types="vite/client" />
/**
 * What a merge starts by itself. Each case is a way a merge could ship
 * half-done: new pages with no data behind them because nobody ran the
 * command, the same day-long job started twice by two quick merges, or a job
 * that died and was never restarted.
 */
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { internal } from "./_generated/api";
import schema from "./schema";
import { COSPONSORS_BACKFILL, JOB_STALE_AFTER_MS } from "./afterDeploy";

const modules = import.meta.glob("./**/*.ts");

async function scheduledNames(t: ReturnType<typeof convexTest>) {
  const all = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return all.map((f) => ({ name: f.name, args: f.args[0] }));
}

test("the first deploy starts the accounts sync, the site check after it, and the cosponsors backfill", async () => {
  const t = convexTest(schema, modules);
  const result = await t.mutation(internal.afterDeploy.run, { now: 1_000_000 });
  expect(result).toEqual({ memberAccounts: "started", cosponsors: "started" });
  const scheduled = await scheduledNames(t);
  expect(scheduled).toContainEqual({ name: "memberAccounts:sync", args: { checkSitesAfter: true } });
  expect(scheduled.filter((f) => f.name === "congressApi:backfillCosponsors")).toHaveLength(1);
});

test("a second merge while the backfill runs starts nothing again", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.afterDeploy.run, { now: 1_000_000 });
  await t.run(async (ctx) => {
    await ctx.db.insert("memberAccounts", {
      bioguideId: "A000001", name: "A Member", chamber: "house", state: "TX", inOffice: true,
      accounts: [], fingerprint: "x", changedAt: "2026-11-02T00:00:00Z",
    });
  });
  const again = await t.mutation(internal.afterDeploy.run, { now: 1_000_000 + 60_000 });
  expect(again).toEqual({ memberAccounts: "done", cosponsors: "running" });
  expect((await scheduledNames(t)).filter((f) => f.name === "congressApi:backfillCosponsors")).toHaveLength(1);
});

test("a backfill that went silent is restarted by the next deploy", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.afterDeploy.run, { now: 1_000_000 });
  const later = await t.mutation(internal.afterDeploy.run, { now: 1_000_000 + JOB_STALE_AFTER_MS + 1 });
  expect(later.cosponsors).toBe("started");
  expect((await scheduledNames(t)).filter((f) => f.name === "congressApi:backfillCosponsors")).toHaveLength(2);
});

test("a finished backfill is never started again", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.afterDeploy.finish, { name: COSPONSORS_BACKFILL });
  const result = await t.mutation(internal.afterDeploy.run, { now: Date.now() + 10 * JOB_STALE_AFTER_MS });
  expect(result.cosponsors).toBe("done");
  expect((await scheduledNames(t)).filter((f) => f.name === "congressApi:backfillCosponsors")).toHaveLength(0);
});

test("the backfill goes newest Congress first", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const congress of [118, 119, 117]) {
      await ctx.db.insert("congressStats", {
        congress, totalCount: 0, houseCount: 0, senateCount: 0, stageCounts: [], updatedAt: "2026-11-02T00:00:00Z",
      });
    }
  });
  expect(await t.query(internal.afterDeploy.heldCongresses, {})).toEqual([119, 118, 117]);
});

async function addBill(t: ReturnType<typeof convexTest>, n: number) {
  await t.mutation(internal.mutations.upsertBill, {
    billId: `${n}hr119`, congress: 119, billType: "hr", billNumber: String(n), billTypeLabel: "H.R.",
    title: "A bill", introducedDate: "2025-01-03",
  });
}

test("a pass where Congress.gov is down does not mark the backfill done", async () => {
  // Review on #233: an outage during the last retry pass stored nothing, so
  // the job was marked done for good with bills still missing.
  process.env.CONGRESS_API_KEY = "test-not-a-real-key";
  vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
  try {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, "billsByChamber");
    aggregateTest.register(t, "billsByStage");
    await addBill(t, 1);
    const result = await t.action(internal.congressApi.backfillCosponsors, { fullScan: true, cursor: null });
    expect(result.done).toBe(false);
    const job = await t.run((ctx) => ctx.db.query("backgroundJobs").first());
    expect(job?.state).toBe("running");
    const retry = (await scheduledNames(t)).find((f) => f.name === "congressApi:backfillCosponsors");
    expect(retry?.args).toMatchObject({ fullScan: true, quietPasses: 1 });

    // Still failing after the last hourly retry: done, and said so in the log.
    const last = await t.action(internal.congressApi.backfillCosponsors, { fullScan: true, cursor: null, quietPasses: 6 });
    expect(last.done).toBe(true);
  } finally {
    vi.unstubAllGlobals();
    delete process.env.CONGRESS_API_KEY;
  }
});

test("a pass that stores cosponsors is followed by another, and a clean one finishes", async () => {
  process.env.CONGRESS_API_KEY = "test-not-a-real-key";
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify({ cosponsors: [], pagination: { count: 0 } }), { status: 200 }),
  );
  try {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, "billsByChamber");
    aggregateTest.register(t, "billsByStage");
    await addBill(t, 1);
    const first = await t.action(internal.congressApi.backfillCosponsors, { fullScan: true, cursor: null });
    expect(first.fixedThisRun).toBe(1);
    expect(first.done).toBe(false);
    const second = await t.action(internal.congressApi.backfillCosponsors, { fullScan: true, cursor: null });
    expect(second.done).toBe(true);
    expect((await t.run((ctx) => ctx.db.query("backgroundJobs").first()))?.state).toBe("done");
  } finally {
    vi.unstubAllGlobals();
    delete process.env.CONGRESS_API_KEY;
  }
});
