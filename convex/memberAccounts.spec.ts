/// <reference types="vite/client" />
/**
 * The daily accounts sync's write step, run as a real Convex mutation against
 * an in-memory database (convex-test), and the bill page reading it. Each case
 * is a way a reader could see a wrong account: a broken download wiping the
 * table, a departed member's archived account, a stale row never updated.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { MemberRecord } from "./memberAccountsParse";

const modules = import.meta.glob("./**/*.ts");

const newTest = () => convexTest(schema, modules);

function member(n: number, accounts = 2): MemberRecord {
  const id = `M${String(n).padStart(6, "0")}`;
  return {
    bioguideId: id,
    name: `Member ${n}`,
    chamber: "house",
    state: "CA",
    officialWebsiteUrl: `https://m${n}.house.gov`,
    accounts: [
      { platform: "x" as const, label: `@m${n}`, url: `https://x.com/m${n}`, source: "congress-legislators" as const },
      { platform: "facebook" as const, label: `m${n}`, url: `https://www.facebook.com/m${n}`, source: "congress-legislators" as const },
    ].slice(0, accounts),
  };
}

const congress = (count: number, accounts = 2) => Array.from({ length: count }, (_, i) => member(i, accounts));

describe("memberAccounts.apply", () => {
  test("writes every member the first time, then only what changed", async () => {
    const t = convexTest(schema, modules);
    const first = await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T07:40:00Z" });
    expect(first).toMatchObject({ written: true, added: 539, changed: 0, left: 0, accounts: 1078 });

    const records = congress(539);
    records[5].accounts[0] = { platform: "x", label: "@renamed", url: "https://x.com/renamed", source: "congress-legislators" };
    const second = await t.mutation(internal.memberAccounts.apply, { records, force: false, now: "2026-11-02T07:40:00Z" });
    expect(second).toMatchObject({ written: true, added: 0, changed: 1, left: 0 });
  });

  test("a member who leaves is hidden, and comes back if they return", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    const gone = await t.mutation(internal.memberAccounts.apply, { records: congress(538), force: false, now: "2026-11-02T00:00:00Z" });
    expect(gone).toMatchObject({ written: true, left: 1 });
    const row = await t.run((ctx) =>
      ctx.db.query("memberAccounts").withIndex("by_bioguideId", (q) => q.eq("bioguideId", "M000538")).unique(),
    );
    expect(row?.inOffice).toBe(false);

    const back = await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-03T00:00:00Z" });
    expect(back).toMatchObject({ changed: 1, left: 0 });
  });

  test("a truncated download writes nothing", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    const result = await t.mutation(internal.memberAccounts.apply, { records: congress(40), force: false, now: "2026-11-02T00:00:00Z" });
    expect(result.written).toBe(false);
    expect(result.problem).toMatch(/only 40 members/);
    const inOffice = await t.run(async (ctx) => (await ctx.db.query("memberAccounts").collect()).filter((r) => r.inOffice).length);
    expect(inOffice).toBe(539);
  });

  test("accounts vanishing from members who stay writes nothing, unless forced", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    const stripped = await t.mutation(internal.memberAccounts.apply, { records: congress(539, 1), force: false, now: "2026-11-02T00:00:00Z" });
    expect(stripped).toMatchObject({ written: false });
    expect(stripped.problem).toMatch(/539 accounts would disappear/);

    const forced = await t.mutation(internal.memberAccounts.apply, { records: congress(539, 1), force: true, now: "2026-11-02T00:00:00Z" });
    expect(forced).toMatchObject({ written: true, changed: 539 });
  });

  test("a new Congress replacing many members at once is written", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2027-01-02T00:00:00Z" });
    // 80 members leave and 80 arrive, the newcomers with nothing on file yet.
    const next = [...congress(459), ...Array.from({ length: 80 }, (_, i) => member(1000 + i, 0))];
    const result = await t.mutation(internal.memberAccounts.apply, { records: next, force: false, now: "2027-01-04T00:00:00Z" });
    expect(result).toMatchObject({ written: true, added: 80, left: 80 });
  });
});

describe("memberAccounts.recordSiteChecks", () => {
  async function confirmedPlatforms(t: ReturnType<typeof newTest>, id = "M000000") {
    const row = await t.run((ctx) =>
      ctx.db.query("memberAccounts").withIndex("by_bioguideId", (q) => q.eq("bioguideId", id)).unique(),
    );
    return row!.accounts.filter((a) => a.confirmedAt).map((a) => a.platform);
  }

  test("an account the site stops linking is no longer confirmed", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "ok", links: ["x:m0", "facebook:m0"] }],
      now: "2026-11-01T08:10:00Z",
    });
    expect(await confirmedPlatforms(t)).toEqual(["x", "facebook"]);
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "ok", links: ["x:m0"] }],
      now: "2026-11-02T08:10:00Z",
    });
    expect(await confirmedPlatforms(t)).toEqual(["x"]);
  });

  test("a blocked or failed check keeps the last result, for 30 days", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "ok", links: ["x:m0", "facebook:m0"] }],
      now: "2026-11-01T08:10:00Z",
    });
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "blocked", links: [] }],
      now: "2026-11-20T08:10:00Z",
    });
    expect(await confirmedPlatforms(t)).toEqual(["x", "facebook"]);
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "failed", links: [] }],
      now: "2026-12-05T08:10:00Z",
    });
    expect(await confirmedPlatforms(t)).toEqual([]);
  });

  test("a site never read confirms nothing", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "blocked", links: [] }],
      now: "2026-11-01T08:10:00Z",
    });
    expect(await confirmedPlatforms(t)).toEqual([]);
  });

  test("a changed handle waits for the next check; an unchanged one stays confirmed", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "ok", links: ["x:m0", "facebook:m0"] }],
      now: "2026-11-01T08:10:00Z",
    });
    const records = congress(539);
    records[0].accounts[0] = { platform: "x", label: "@renamed", url: "https://x.com/renamed", source: "congress-legislators" };
    await t.mutation(internal.memberAccounts.apply, { records, force: false, now: "2026-11-02T07:40:00Z" });
    expect(await confirmedPlatforms(t)).toEqual(["facebook"]);
  });
});

describe("bills.getPage sponsor accounts", () => {
  function setup() {
    const t = convexTest(schema, modules);
    aggregateTest.register(t, "billsByChamber");
    aggregateTest.register(t, "billsByStage");
    return t;
  }

  async function addBill(t: ReturnType<typeof setup>, sponsorBioguideId?: string) {
    await t.mutation(internal.mutations.upsertBill, {
      billId: "1hr119",
      congress: 119,
      billType: "hr",
      billNumber: "1",
      billTypeLabel: "H.R.",
      title: "A bill",
      introducedDate: "2025-01-03",
      sponsorFirstName: "Member",
      sponsorLastName: "Zero",
      sponsorParty: "D",
      sponsorState: "CA",
      ...(sponsorBioguideId ? { sponsorBioguideId } : {}),
    });
  }

  test("shows only the accounts the member's own site links, and the website", async () => {
    const t = setup();
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    await addBill(t, "M000000");

    // Before any site check, nothing is confirmed: only the website shows.
    let page = await t.query(api.bills.getPage, { billId: "1hr119" });
    expect(page!.extras.sponsorAccounts).toEqual({ bioguideId: "M000000", accounts: [], officialWebsiteUrl: "https://m0.house.gov" });

    // The site links the X account but not the Facebook page.
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "ok", links: ["x:m0", "facebook:someoneelse"] }],
      now: "2026-11-01T08:10:00Z",
    });
    page = await t.query(api.bills.getPage, { billId: "1hr119" });
    expect(page!.extras.sponsorAccounts).toEqual({
      bioguideId: "M000000",
      accounts: [{ platform: "x", label: "@m0", url: "https://x.com/m0", source: "congress-legislators" }],
      officialWebsiteUrl: "https://m0.house.gov",
    });
  });

  test("shows nothing for a sponsor who has left office", async () => {
    const t = setup();
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    await t.mutation(internal.memberAccounts.apply, { records: congress(539).slice(1), force: false, now: "2026-11-02T00:00:00Z" });
    await addBill(t, "M000000");
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    expect(page!.extras.sponsorAccounts).toBeNull();
  });

  test("shows nothing for a bill without a sponsor id", async () => {
    const t = setup();
    await t.mutation(internal.memberAccounts.apply, { records: congress(539), force: false, now: "2026-11-01T00:00:00Z" });
    await addBill(t);
    const page = await t.query(api.bills.getPage, { billId: "1hr119" });
    expect(page!.extras.sponsorAccounts).toBeNull();
  });
});
