/// <reference types="vite/client" />
/**
 * A bill's cosponsors: stored as a set by the sync, and drawn on the bill page
 * with each member's confirmed accounts. Each case is a way a reader could be
 * told something false: a count that includes withdrawn members, "no
 * cosponsors" for a bill never checked, a former member's archived accounts.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { CosponsorRow } from "./cosponsors";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "billsByChamber");
  aggregateTest.register(t, "billsByStage");
  return t;
}

async function addBill(t: ReturnType<typeof setup>) {
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
}

function cosponsor(n: number, extra: Partial<CosponsorRow> = {}): CosponsorRow {
  return {
    bioguideId: `C${String(n).padStart(6, "0")}`,
    firstName: "Member",
    lastName: `Number${String(n).padStart(3, "0")}`,
    party: "R",
    state: "TX",
    district: n,
    sponsorshipDate: `2025-02-${String((n % 28) + 1).padStart(2, "0")}`,
    isOriginal: n < 3,
    ...extra,
  };
}

const rows = (count: number) => Array.from({ length: count }, (_, i) => cosponsor(i));

describe("cosponsors on a bill page", () => {
  test("a bill whose cosponsors were never fetched says nothing about them", async () => {
    const t = setup();
    await addBill(t);
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    expect(page!.extras.cosponsors).toEqual({ fetched: false, total: 0, shown: [] });
  });

  test("a fetched bill with none says so", async () => {
    const t = setup();
    await addBill(t);
    await t.mutation(internal.mutations.replaceBillCosponsors, { billId: "1hr119", cosponsors: [] });
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    expect(page!.extras.cosponsors).toEqual({ fetched: true, total: 0, shown: [] });
  });

  test("shows the first ten, original cosponsors first, and counts only current ones", async () => {
    const t = setup();
    await addBill(t);
    const list = [...rows(14), cosponsor(99, { withdrawnDate: "2025-03-01", isOriginal: true })];
    await t.mutation(internal.mutations.replaceBillCosponsors, { billId: "1hr119", cosponsors: list });
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    const c = page!.extras.cosponsors;
    expect(c.total).toBe(14);
    expect(c.shown).toHaveLength(10);
    expect(c.shown.slice(0, 3).every((s) => s.isOriginal)).toBe(true);
    expect(c.shown.some((s) => s.bioguideId === "C000099")).toBe(false);

    const all = await t.query(api.bills.getCosponsors, { billId: "1hr119" });
    expect(all!.shown).toHaveLength(14);
  });

  test("each cosponsor carries only accounts their own site confirmed", async () => {
    const t = setup();
    await addBill(t);
    await t.mutation(internal.memberAccounts.apply, {
      records: Array.from({ length: 539 }, (_, i) => ({
        bioguideId: i === 0 ? "C000000" : `M${String(i).padStart(6, "0")}`,
        name: `Member ${i}`,
        chamber: "house" as const,
        state: "TX",
        officialWebsiteUrl: `https://m${i}.house.gov`,
        accounts: [
          { platform: "x" as const, label: `@m${i}`, url: `https://x.com/m${i}`, source: "congress-legislators" as const },
          { platform: "instagram" as const, label: `@m${i}`, url: `https://www.instagram.com/m${i}/`, source: "congress-legislators" as const },
        ],
      })),
      force: false,
      now: "2026-11-01T07:40:00Z",
    });
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "C000000", status: "ok", links: ["x:m0"] }],
      now: "2026-11-01T08:10:00Z",
    });
    await t.mutation(internal.mutations.replaceBillCosponsors, { billId: "1hr119", cosponsors: rows(2) });
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    const [first, second] = page!.extras.cosponsors.shown;
    expect(first.accounts!.accounts).toEqual([
      { platform: "x", label: "@m0", url: "https://x.com/m0", source: "congress-legislators" },
    ]);
    // Not in the members table at all (a former member): no accounts.
    expect(second.accounts).toBeNull();
  });

  test("the page's ten are exactly the first ten of the full list, even with many originals", async () => {
    const t = setup();
    await addBill(t);
    // H.R. 22 in the 119th: 110 cosponsors, all original, all the same day.
    const originals = Array.from({ length: 60 }, (_, i) =>
      cosponsor(i, { isOriginal: true, sponsorshipDate: "2025-01-03", lastName: `Name${String(59 - i).padStart(2, "0")}` }),
    );
    await t.mutation(internal.mutations.replaceBillCosponsors, { billId: "1hr119", cosponsors: originals });
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    const all = await t.query(api.bills.getCosponsors, { billId: "1hr119" });
    expect(page!.extras.cosponsors.shown.map((c) => c.bioguideId)).toEqual(all!.shown.slice(0, 10).map((c) => c.bioguideId));
    expect(page!.extras.cosponsors.shown[0].name).toBe("Member Name00");
    expect(page!.extras.cosponsors.total).toBe(60);
  });

  test("an unchanged set is not rewritten", async () => {
    const t = setup();
    await addBill(t);
    await t.mutation(internal.mutations.replaceBillCosponsors, { billId: "1hr119", cosponsors: rows(5) });
    const before = await t.run((ctx) => ctx.db.query("billCosponsors").collect());
    await t.mutation(internal.mutations.replaceBillCosponsors, { billId: "1hr119", cosponsors: [...rows(5)].reverse() });
    const after = await t.run((ctx) => ctx.db.query("billCosponsors").collect());
    expect(after.map((r) => r._id).sort()).toEqual(before.map((r) => r._id).sort());

    await t.mutation(internal.mutations.replaceBillCosponsors, { billId: "1hr119", cosponsors: rows(6) });
    const changed = await t.run((ctx) => ctx.db.query("billCosponsors").collect());
    expect(changed).toHaveLength(6);
  });
});
