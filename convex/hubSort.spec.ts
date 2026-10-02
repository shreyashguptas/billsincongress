/// <reference types="vite/client" />
/**
 * `bills.listSorted` — the hub pages' "Newest first" / "Oldest first" — run as
 * a real Convex query against an in-memory database (convex-test).
 *
 * /bills/enacted listed laws in the order the sync happened to store them, with
 * introduction dates on each row that made it look sorted. These pin the
 * promise the hub now makes: a real order, over the whole set, undated bills
 * last, the same on page 10 as on page 1.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type T = ReturnType<typeof convexTest>;

let nextNumber = 1;

async function insert(
  t: T,
  rows: Array<{
    billType?: string;
    progressStage?: number;
    stageDate?: string;
    latestActionDate?: string;
    policyAreaName?: string;
    congress?: number;
  }>,
) {
  await t.run(async (ctx) => {
    for (const row of rows) {
      const billNumber = String(nextNumber++);
      const billType = row.billType ?? "hr";
      await ctx.db.insert("bills", {
        billId: `${billNumber}${billType}${row.congress ?? 119}`,
        congress: row.congress ?? 119,
        billType,
        billNumber,
        billTypeLabel: billType.toUpperCase(),
        title: `Bill ${billNumber}`,
        introducedDate: "2025-01-03",
        progressStage: row.progressStage ?? 40,
        ...(row.stageDate !== undefined ? { stageDate: row.stageDate } : {}),
        ...(row.latestActionDate !== undefined ? { latestActionDate: row.latestActionDate } : {}),
        ...(row.policyAreaName !== undefined ? { policyAreaName: row.policyAreaName } : {}),
        updatedAt: "2025-01-03T00:00:00Z",
      });
    }
  });
}

type Scope =
  | { kind: "stage"; progressStage: number }
  | { kind: "topic"; policyArea: string }
  | { kind: "chamber"; chamber: "house" | "senate" };

async function readAll(t: T, scope: Scope, order: "newest" | "oldest", limit = 50) {
  const rows: Array<{ billId: string; stageDate?: string; latestActionDate?: string; billType: string }> = [];
  for (let offset = 0; ; offset += limit) {
    const page = await t.query(api.bills.listSorted, { congress: 119, scope, order, offset, limit });
    rows.push(...page.data);
    if (!page.hasMore) return rows;
  }
}

const day = (i: number) => `2025-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`;

describe("bills.listSorted", () => {
  test("a stage hub is ordered by the day each bill reached the stage, not by insertion", async () => {
    nextNumber = 1;
    const t = convexTest(schema, modules);
    // Inserted oldest-law-last, the way the sync stored the 119th's laws.
    await insert(t, [
      { progressStage: 100, stageDate: "2025-12-29", latestActionDate: "2026-02-11" },
      { progressStage: 100, stageDate: "2026-09-25", latestActionDate: "2026-09-25" },
      { progressStage: 100, stageDate: "2025-01-29", latestActionDate: "2025-01-29" },
      { progressStage: 40, stageDate: "2026-09-30" },
      { progressStage: 100, stageDate: "2026-09-25", latestActionDate: "2026-09-25", congress: 118 },
    ]);

    const newest = await t.query(api.bills.listSorted, {
      congress: 119,
      scope: { kind: "stage", progressStage: 100 },
      order: "newest",
    });
    expect(newest.sortedBy).toBe("stageDate");
    expect(newest.data.map((b) => b.stageDate)).toEqual(["2026-09-25", "2025-12-29", "2025-01-29"]);

    const oldest = await t.query(api.bills.listSorted, {
      congress: 119,
      scope: { kind: "stage", progressStage: 100 },
      order: "oldest",
    });
    expect(oldest.data.map((b) => b.stageDate)).toEqual(["2025-01-29", "2025-12-29", "2026-09-25"]);
  });

  test("undated bills come last in both orders, never first", async () => {
    nextNumber = 1;
    const t = convexTest(schema, modules);
    await insert(t, [
      { progressStage: 20 },
      { progressStage: 20, stageDate: "2025-03-01" },
      { progressStage: 20, stageDate: "2025-02-01" },
    ]);
    for (const order of ["newest", "oldest"] as const) {
      const rows = await readAll(t, { kind: "stage", progressStage: 20 }, order);
      expect(rows).toHaveLength(3);
      expect(rows[2].stageDate).toBeUndefined();
    }
  });

  test("a chamber merges its four bill types into one order, page after page", async () => {
    nextNumber = 1;
    const t = convexTest(schema, modules);
    const types = ["s", "sres", "sjres", "sconres"];
    await insert(
      t,
      Array.from({ length: 160 }, (_, i) => ({ billType: types[i % 4], latestActionDate: day(i) })),
    );
    // House bills interleaved, which a Senate hub must never show.
    await insert(t, Array.from({ length: 40 }, (_, i) => ({ billType: "hr", latestActionDate: day(i) })));
    await insert(t, [{ billType: "sres" }]); // no action yet

    for (const order of ["newest", "oldest"] as const) {
      const rows = await readAll(t, { kind: "chamber", chamber: "senate" }, order, 25);
      expect(rows).toHaveLength(161);
      expect(new Set(rows.map((r) => r.billId)).size).toBe(161);
      expect(rows.every((r) => r.billType.startsWith("s"))).toBe(true);
      const dates = rows.slice(0, 160).map((r) => r.latestActionDate!);
      const sorted = [...dates].sort();
      expect(dates).toEqual(order === "oldest" ? sorted : sorted.reverse());
      expect(rows[160].latestActionDate).toBeUndefined();
    }
  });

  test("a topic hub reads the whole topic, and only that topic", async () => {
    nextNumber = 1;
    const t = convexTest(schema, modules);
    await insert(
      t,
      Array.from({ length: 60 }, (_, i) => ({
        policyAreaName: i % 3 === 0 ? "Health" : "Taxation",
        latestActionDate: day(i),
      })),
    );
    const rows = await readAll(t, { kind: "topic", policyArea: "Health" }, "newest", 7);
    expect(rows).toHaveLength(20);
    const dates = rows.map((r) => r.latestActionDate!);
    expect(dates).toEqual([...dates].sort().reverse());

    const first = await t.query(api.bills.listSorted, {
      congress: 119,
      scope: { kind: "topic", policyArea: "Health" },
      order: "newest",
      limit: 7,
    });
    expect(first.sortedBy).toBe("latestActionDate");
    expect(first.hasMore).toBe(true);
  });
});
