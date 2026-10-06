/// <reference types="vite/client" />
/**
 * The backfill's write and the recount that follows it.
 *
 * Counted by spelling, Jacky Rosen had 73 bills in the 119th (7 more say
 * "Jacklyn"), and the 118th's two Robert Menendezes were one member with 89.
 * Once each bill carries its sponsor's Congress.gov id, the recount groups by it.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "billsByChamber");
  aggregateTest.register(t, "billsByStage");
  return t;
}

async function addBill(
  t: ReturnType<typeof setup>,
  n: number,
  billType: string,
  first: string,
  last: string,
  state: string,
) {
  await t.mutation(internal.mutations.upsertBill, {
    billId: `${n}${billType}118`,
    congress: 118,
    billType,
    billNumber: String(n),
    billTypeLabel: billType === "s" ? "S." : "H.R.",
    title: "A bill",
    introducedDate: "2024-01-01",
    sponsorFirstName: first,
    sponsorLastName: last,
    sponsorParty: "D",
    sponsorState: state,
  });
}

async function row(t: ReturnType<typeof setup>, billId: string) {
  return await t.run(async (ctx) =>
    ctx.db.query("bills").withIndex("by_billId", (q) => q.eq("billId", billId)).unique(),
  );
}

describe("sponsor identity backfill", () => {
  test("stores the id and the re-cased name, marks the bill done, and leaves updatedAt", async () => {
    const t = setup();
    await addBill(t, 1, "hr", "ROSA", "DELAURO", "CT");
    const before = await row(t, "1hr118");
    await t.mutation(internal.mutations.setBillSponsorIdentity, {
      billId: "1hr118",
      sponsorFirstName: "Rosa",
      sponsorLastName: "DeLauro",
      sponsorParty: "D",
      sponsorState: "CT",
      sponsorBioguideId: "D000216",
    });
    const after = await row(t, "1hr118");
    expect(after?.sponsorLastName).toBe("DeLauro");
    expect(after?.sponsorBioguideId).toBe("D000216");
    expect((after?.extraSyncedBits ?? 0) & 4).toBe(4);
    expect(after?.updatedAt).toBe(before?.updatedAt);
  });

  test("a bill with no sponsor is marked done and nothing else changes", async () => {
    const t = setup();
    await addBill(t, 2, "hr", "", "", "");
    await t.mutation(internal.mutations.setBillSponsorIdentity, { billId: "2hr118" });
    const after = await row(t, "2hr118");
    expect((after?.extraSyncedBits ?? 0) & 4).toBe(4);
    expect(after?.sponsorBioguideId).toBeUndefined();
  });

  test("the recount groups by id: two Menendezes apart, two spellings together", async () => {
    const t = setup();
    let n = 0;
    for (let i = 0; i < 3; i++) await addBill(t, ++n, "s", "Robert", "Menendez", "NJ");
    for (let i = 0; i < 2; i++) await addBill(t, ++n, "hr", "Robert", "Menendez", "NJ");
    await addBill(t, ++n, "s", "Jacky", "Rosen", "NV");
    await addBill(t, ++n, "s", "Jacklyn", "Rosen", "NV");
    for (let i = 1; i <= n; i++) {
      const billType = i <= 3 || i >= 6 ? "s" : "hr";
      const b = await row(t, `${i}${billType}118`);
      const id = b?.sponsorLastName === "Rosen" ? "R000608" : billType === "s" ? "M000639" : "M001226";
      await t.mutation(internal.mutations.setBillSponsorIdentity, { billId: `${i}${billType}118`, sponsorBioguideId: id });
    }
    await t.action(internal.mutations.recomputeCongressSponsors, { congress: 118 });
    const rows = await t.run(async (ctx) =>
      ctx.db.query("congressSponsors").withIndex("by_congress", (q) => q.eq("congress", 118)).collect(),
    );
    const byName = Object.fromEntries(rows.map((r) => [r.sponsorName, r.billCount]));
    expect(byName["Robert Menendez (Senate)"]).toBe(3);
    expect(byName["Robert Menendez (House)"]).toBe(2);
    const rosen = rows.find((r) => r.sponsorBioguideId === "R000608");
    expect(rosen?.billCount).toBe(2);
    expect(rosen?.spellings).toEqual(["Jacklyn Rosen", "Jacky Rosen"]);
  });
});
