/// <reference types="vite/client" />
/**
 * The enrichment backfill's rate-limit pause.
 *
 * `lastRateLimitRemaining` lives at module level, and the backfill checks it
 * before its first call. A run that paused on a low budget used to leave that
 * low number behind, so the run scheduled 15 minutes later read it, paused again
 * without making a call, and so on forever.
 */
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.CONGRESS_API_KEY;
});

test("pauses when Congress.gov's hourly budget runs low, then carries on", async () => {
  process.env.CONGRESS_API_KEY = "test";
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "billsByChamber");
  aggregateTest.register(t, "billsByStage");
  for (const n of [1, 2, 3]) {
    await t.mutation(internal.mutations.upsertBill, {
      billId: `${n}hr118`,
      congress: 118,
      billType: "hr",
      billNumber: String(n),
      billTypeLabel: "H.R.",
      title: "A bill",
      introducedDate: "2024-01-01",
    });
  }

  // Stand-in Congress.gov. The first bill's two answers say the budget is nearly spent;
  // later ones, after the pause, that it has refilled.
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const headers = { "x-ratelimit-remaining": calls.length <= 2 ? "100" : "4900" };
    const body = url.includes("/subjects")
      ? { subjects: { policyArea: { name: "Health" }, legislativeSubjects: [] } }
      : { textVersions: [] };
    return new Response(JSON.stringify(body), { status: 200, headers });
  });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});

  await t.run(async (ctx) => {
    await ctx.scheduler.runAfter(0, internal.congressApi.backfillBillEnrichment, {});
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  expect(warn.mock.calls.some(([m]) => String(m).includes("rate-limit floor hit"))).toBe(true);
  const bills = await t.run(async (ctx) => ctx.db.query("bills").collect());
  expect(bills.map((b) => (b.extraSyncedBits ?? 0) & 3)).toEqual([3, 3, 3]);
  // Each bill's subjects and text, fetched once.
  expect(calls.length).toBe(6);
});
