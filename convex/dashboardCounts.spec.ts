/// <reference types="vite/client" />
/**
 * The home page's two denominators that are not "every measure".
 *
 * "Became law: about 1 in 163 bills" divided the 119th's 120 laws by all
 * 19,539 measures, 2,716 of them simple and concurrent resolutions that can
 * never become law. And its "Passed one chamber: 1,464" held 633 House and
 * Senate resolutions that were already finished. Both numbers now come from
 * the same recompute that writes the stage ladder.
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

const LABEL: Record<string, string> = {
  hr: "H.R.", s: "S.", hjres: "H.J.Res.", sjres: "S.J.Res.",
  hres: "H.Res.", sres: "S.Res.", hconres: "H.Con.Res.", sconres: "S.Con.Res.",
};

async function seed(t: ReturnType<typeof setup>, rows: Array<[string, number]>) {
  let n = 0;
  for (const [billType, progressStage] of rows) {
    n += 1;
    await t.mutation(internal.mutations.upsertBill, {
      billId: `${n}${billType}119`,
      congress: 119,
      billType,
      billNumber: String(n),
      billTypeLabel: LABEL[billType],
      title: "A measure",
      introducedDate: "2025-02-01",
      progressStage,
      progressDescription: "x",
    });
  }
}

describe("home page denominators", () => {
  test("laws are divided by what can become law, and finished resolutions are counted", async () => {
    const t = setup();
    await seed(t, [
      ["hr", 100], ["s", 100], ["hjres", 100], ["hr", 40], ["s", 60], ["sjres", 40],
      ["hres", 60], ["sres", 60], ["sres", 40], // two adopted simple resolutions
      ["hconres", 80], ["sconres", 60], // one concurrent agreed by both, one by one
    ]);
    await t.action(internal.mutations.recomputeCongressStats, { congress: 119 });
    const d = await t.query(api.bills.getCongressDashboard, { congress: 119 });

    expect(d?.totalBills).toBe(11);
    expect(d?.lawCapableCount).toBe(6);
    expect(d?.finishedResolutions).toEqual({ passedOneChamber: 2, passedBothChambers: 1 });
  });

  test("a stats row written before these fields says nothing rather than guessing", async () => {
    const t = setup();
    await t.run(async (ctx) => {
      await ctx.db.insert("congressStats", {
        congress: 119,
        totalCount: 5,
        houseCount: 3,
        senateCount: 2,
        stageCounts: [{ stage: 40, description: "In Committee", count: 5 }],
        updatedAt: "2026-10-01T00:00:00Z",
      });
    });
    const d = await t.query(api.bills.getCongressDashboard, { congress: 119 });
    expect(d?.lawCapableCount).toBeUndefined();
    expect(d?.finishedResolutions).toBeUndefined();
  });
});
