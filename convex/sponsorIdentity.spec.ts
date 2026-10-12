/// <reference types="vite/client" />
/**
 * The backfill's write and the recount that follows it.
 *
 * Counted by spelling, Jacky Rosen had 73 bills in the 119th (7 more say
 * "Jacklyn"), and the 118th's two Robert Menendezes were one member with 89.
 * Once each bill carries its sponsor's Congress.gov id, the recount groups by it.
 */
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
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

  test("a title stored with a line break inside it is put on one line", async () => {
    const t = setup();
    await addBill(t, 3, "s", "Jacky", "Rosen", "NV");
    await t.run(async (ctx) => {
      const b = await ctx.db.query("bills").withIndex("by_billId", (q) => q.eq("billId", "3s118")).unique();
      await ctx.db.patch(b!._id, { title: "A joint resolution under chapter 8 of title 5, \nUnited States Code" });
    });
    await t.mutation(internal.mutations.setBillSponsorIdentity, { billId: "3s118", sponsorBioguideId: "R000608" });
    expect((await row(t, "3s118"))?.title).toBe("A joint resolution under chapter 8 of title 5, United States Code");
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

  describe("the backfill job, end to end against a stand-in Congress.gov", () => {
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      delete process.env.CONGRESS_API_KEY;
    });

    // What Congress.gov's bill detail says about each test bill's sponsor.
    const DETAIL: Record<string, object | null> = {
      "1s118": { bioguideId: "R000608", firstName: "Jacky", lastName: "Rosen", fullName: "Sen. Rosen, Jacky [D-NV]", party: "D", state: "NV" },
      "2s118": { bioguideId: "R000608", firstName: "Jacklyn", lastName: "Rosen", fullName: "Sen. Rosen, Jacky [D-NV]", party: "D", state: "NV" },
      "3hr118": { bioguideId: "D000216", firstName: "ROSA", lastName: "DELAURO", fullName: "Rep. DeLauro, Rosa L. [D-CT-3]", party: "D", state: "CT" },
      "4hr118": { bioguideId: "P000096", firstName: "WILLIAM", lastName: "PASCRELL", fullName: "Rep. Pascrell, Bill, Jr. [D-NJ-9]", party: "D", state: "NJ" },
      "5hr118": null, // a reserved number: no sponsor
      "6hr118": { bioguideId: "M001226", firstName: "Robert", lastName: "Menendez", fullName: "Rep. Menendez, Robert [D-NJ-8]", party: "D", state: "NJ" },
      "7s118": { bioguideId: "M000639", firstName: "Robert", lastName: "Menendez", fullName: "Sen. Menendez, Robert [D-NJ]", party: "D", state: "NJ" },
      "8hr118": { bioguideId: "T000001", firstName: "Pat", lastName: "Test", fullName: "Rep. Test, Pat [D-NJ-1]", party: "D", state: "NJ" },
    };

    async function seed(t: ReturnType<typeof setup>) {
      await addBill(t, 1, "s", "Jacky", "Rosen", "NV");
      await addBill(t, 2, "s", "Jacklyn", "Rosen", "NV");
      await addBill(t, 3, "hr", "ROSA", "DELAURO", "CT");
      await addBill(t, 4, "hr", "WILLIAM", "PASCRELL", "NJ");
      await addBill(t, 5, "hr", "", "", "");
      await addBill(t, 6, "hr", "Robert", "Menendez", "NJ");
      await addBill(t, 7, "s", "Robert", "Menendez", "NJ");
      await addBill(t, 8, "hr", "Pat", "Test", "NJ");
      await addBill(t, 9, "hr", "Gone", "Missing", "NJ"); // Congress.gov never returns it
    }

    /** Stand-in Congress.gov: 8hr118 fails once, 9hr118 always 404s. */
    function stubCongressGov(remaining: (call: number) => string) {
      const calls: string[] = [];
      vi.stubGlobal("fetch", async (input: string | URL | Request) => {
        const m = /\/bill\/(\d+)\/(\w+)\/(\d+)\?/.exec(String(input));
        const billId = m ? `${m[3]}${m[2]}${m[1]}` : "?";
        calls.push(billId);
        const headers = { "x-ratelimit-remaining": remaining(calls.length) };
        if (billId === "9hr118") return new Response("{}", { status: 404, headers });
        if (billId === "8hr118" && calls.filter((c) => c === billId).length === 1) {
          return new Response("{}", { status: 500, headers });
        }
        const sponsor = DETAIL[billId];
        return new Response(JSON.stringify({ bill: { sponsors: sponsor ? [sponsor] : [] } }), { status: 200, headers });
      });
      return calls;
    }

    async function runToTheEnd(t: ReturnType<typeof setup>) {
      await t.run(async (ctx) => {
        await ctx.scheduler.runAfter(0, internal.congressApi.backfillSponsorIdentity, {});
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
    }

    test("stores every id it can, retries a failure, stops, and recounts members", async () => {
      process.env.CONGRESS_API_KEY = "test";
      vi.useFakeTimers();
      const t = setup();
      await seed(t);
      const before = await t.run(async (ctx) => ctx.db.query("bills").collect());
      const calls = stubCongressGov(() => "4900");

      await runToTheEnd(t);

      // Pass 1 does all nine; 8hr118 fails. Pass 2 retries 8hr118 and 9hr118.
      // Pass 3 finds only 9hr118, which still fails, so the job ends.
      const count = (id: string) => calls.filter((c) => c === id).length;
      expect(count("1s118")).toBe(1);
      expect(count("8hr118")).toBe(2);
      expect(count("9hr118")).toBe(3);
      expect(calls.length).toBe(12);

      const after = new Map((await t.run(async (ctx) => ctx.db.query("bills").collect())).map((b) => [b.billId, b]));
      expect(after.get("3hr118")).toMatchObject({ sponsorFirstName: "Rosa", sponsorLastName: "DeLauro", sponsorBioguideId: "D000216" });
      expect(after.get("4hr118")).toMatchObject({ sponsorFirstName: "William", sponsorLastName: "Pascrell" });
      expect(after.get("8hr118")?.sponsorBioguideId).toBe("T000001");
      // A reserved number is marked done with nothing stored; a bill Congress.gov
      // never returned is left exactly as it was, to be tried on a later run.
      expect(after.get("5hr118")?.sponsorBioguideId).toBeUndefined();
      expect((after.get("5hr118")?.extraSyncedBits ?? 0) & 4).toBe(4);
      expect(after.get("9hr118")).toEqual(before.find((b) => b.billId === "9hr118"));
      // Nothing here is news to a search engine.
      for (const b of before) expect(after.get(b.billId)?.updatedAt).toBe(b.updatedAt);

      // The recount ran at the end and groups by id.
      const rows = await t.run(async (ctx) =>
        ctx.db.query("congressSponsors").withIndex("by_congress", (q) => q.eq("congress", 118)).collect(),
      );
      const shown = Object.fromEntries(rows.map((r) => [r.sponsorName, r.billCount]));
      const rosen = rows.filter((r) => r.sponsorBioguideId === "R000608");
      expect(rosen.map((r) => [r.billCount, r.spellings])).toEqual([[2, ["Jacklyn Rosen", "Jacky Rosen"]]]);
      delete shown[rosen[0].sponsorName];
      expect(shown).toEqual({
        "Rosa DeLauro": 1,
        "William Pascrell": 1,
        "Robert Menendez (House)": 1,
        "Robert Menendez (Senate)": 1,
        "Pat Test": 1,
        "Gone Missing": 1,
      });

      // Running it again only retries the bill that never came back.
      calls.length = 0;
      await runToTheEnd(t);
      expect(calls).toEqual(["9hr118"]);
    });

    test("pauses when Congress.gov's hourly budget runs low, then carries on", async () => {
      process.env.CONGRESS_API_KEY = "test";
      vi.useFakeTimers();
      const t = setup();
      await seed(t);
      // The first answer says the budget is nearly spent; later ones, after the
      // 15-minute pause, that it has refilled. A pause must not repeat forever
      // on the remembered low number.
      const calls = stubCongressGov((n) => (n === 1 ? "100" : "4900"));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await runToTheEnd(t);

      expect(warn.mock.calls.some(([m]) => String(m).includes("rate-limit floor hit"))).toBe(true);
      const after = await t.run(async (ctx) => ctx.db.query("bills").collect());
      expect(after.filter((b) => b.sponsorBioguideId).length).toBe(7);
      expect(calls.filter((c) => c === "1s118").length).toBe(1);
      warn.mockRestore();
    });
  });
});

