/// <reference types="vite/client" />
/**
 * `bills.list` with a sponsor filter, run as a real Convex query against an
 * in-memory database (convex-test).
 *
 * A sponsor filter used to iterate the whole congress newest-first and stop at
 * the 1,200-row scan cap. A dashboard drilldown to one senator showed 6 of his
 * 185 bills, and "Load more" repeated the same capped scan.
 */
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

type T = ReturnType<typeof convexTest>;

let nextNumber = 1;

async function insertBills(
  t: T,
  count: number,
  sponsor: { first: string; last: string; state?: string },
) {
  await t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      const billNumber = String(nextNumber++);
      await ctx.db.insert("bills", {
        billId: `${billNumber}s119`,
        congress: 119,
        billType: "s",
        billNumber,
        billTypeLabel: "S.",
        title: `A bill numbered ${billNumber}`,
        introducedDate: "2025-06-01",
        sponsorFirstName: sponsor.first,
        sponsorLastName: sponsor.last,
        sponsorState: sponsor.state ?? "FL",
        progressStage: 20,
        updatedAt: "2025-06-01T00:00:00Z",
      });
    }
  });
}

async function listAll(t: T, sponsorFilter: string[]) {
  const ids: string[] = [];
  for (let offset = 0; ; offset += 50) {
    const page = await t.query(api.bills.list, {
      congress: 119,
      sponsorFilter,
      offset,
      limit: 50,
    });
    expect(page.truncated).toBe(false);
    ids.push(...page.data.map((b) => b.billId));
    if (!page.hasMore) return ids;
  }
}

describe("bills.list with a sponsor filter", () => {
  beforeEach(() => {
    nextNumber = 1;
  });

  test("reaches every bill of a sponsor whose bills sit past the scan cap", async () => {
    const t = convexTest(schema, modules);
    // Oldest first, so a newest-first congress scan meets them last.
    await insertBills(t, 180, { first: "Rick", last: "Scott" });
    await insertBills(t, 5, { first: "Rick", last: "SCOTT" });
    await insertBills(t, 40, { first: "Tim", last: "Scott", state: "SC" });
    await insertBills(t, 1300, { first: "Other", last: "Member", state: "TX" });

    const ids = await listAll(t, ["Rick Scott"]);
    expect(ids).toHaveLength(185);
    expect(new Set(ids).size).toBe(185);

    // Newest first, the same order as the unfiltered list.
    expect(ids[0]).toBe("185s119");
    expect(ids[184]).toBe("1s119");
  });

  test("finds a member whose surname has more than one word", async () => {
    const t = convexTest(schema, modules);
    await insertBills(t, 30, { first: "Monica", last: "De La Cruz", state: "TX" });
    await insertBills(t, 1300, { first: "Other", last: "Member", state: "TX" });

    expect(await listAll(t, ["Monica De La Cruz"])).toHaveLength(30);
  });

  test("combines two sponsors and applies the other filters", async () => {
    const t = convexTest(schema, modules);
    await insertBills(t, 20, { first: "Rick", last: "Scott", state: "FL" });
    await insertBills(t, 10, { first: "Tim", last: "Scott", state: "SC" });
    await insertBills(t, 1300, { first: "Other", last: "Member", state: "TX" });

    expect(await listAll(t, ["Rick Scott", "Tim Scott"])).toHaveLength(30);

    const sc = await t.query(api.bills.list, {
      congress: 119,
      sponsorFilter: ["Rick Scott", "Tim Scott"],
      sponsorState: "SC",
      limit: 50,
    });
    expect(sc.data).toHaveLength(10);
    expect(sc.truncated).toBe(false);
  });

  test("says the list is partial when the surname reads run out of budget", async () => {
    const t = convexTest(schema, modules);
    await insertBills(t, 1300, { first: "Some", last: "Smith" });

    const page = await t.query(api.bills.list, {
      congress: 119,
      sponsorFilter: ["John Smith"],
      limit: 10,
    });
    expect(page.data).toHaveLength(0);
    expect(page.truncated).toBe(true);
  });

  test("a partial list keeps the newest matches, not the oldest", async () => {
    const t = convexTest(schema, modules);
    await insertBills(t, 1300, { first: "John", last: "Smith" });

    const page = await t.query(api.bills.list, {
      congress: 119,
      sponsorFilter: ["John Smith"],
      limit: 10,
    });
    expect(page.truncated).toBe(true);
    expect(page.data[0].billId).toBe("1300s119");
  });

  test("a hand-typed name in the wrong case still finds the member", async () => {
    const t = convexTest(schema, modules);
    await insertBills(t, 12, { first: "Michael", last: "McCaul", state: "TX" });
    await insertBills(t, 1300, { first: "Other", last: "Member", state: "TX" });
    await t.run(async (ctx) => {
      await ctx.db.insert("congressSponsors", {
        congress: 119,
        sponsorName: "Michael McCaul",
        sponsorState: "TX",
        billCount: 12,
      });
    });

    // Title Case would guess "Mccaul"; only the stored spelling reaches him.
    expect(await listAll(t, ["michael mccaul"])).toHaveLength(12);
  });
});
