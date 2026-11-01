/// <reference types="vite/client" />
/**
 * The member page's one query. Each case is a way it could mislead: a page for
 * someone we know nothing about, a withdrawn cosponsorship shown as current,
 * bills out of order, a former member's archived accounts.
 */
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import aggregateTest from "@convex-dev/aggregate/test";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { MemberRecord } from "./memberAccountsParse";

const modules = import.meta.glob("./**/*.ts");

function setup() {
  const t = convexTest(schema, modules);
  aggregateTest.register(t, "billsByChamber");
  aggregateTest.register(t, "billsByStage");
  return t;
}

function member(n: number): MemberRecord {
  return {
    bioguideId: `M${String(n).padStart(6, "0")}`,
    name: `Member ${n}`,
    chamber: "house",
    state: "CA",
    party: "D",
    district: 12,
    officialWebsiteUrl: `https://m${n}.house.gov`,
    accounts: [{ platform: "x", label: `@m${n}`, url: `https://x.com/m${n}`, source: "congress-legislators" }],
  };
}

async function seed(t: ReturnType<typeof setup>) {
  await t.mutation(internal.memberAccounts.apply, {
    records: Array.from({ length: 539 }, (_, i) => member(i)),
    force: false,
    now: "2026-11-01T07:40:00Z",
  });
  for (let i = 1; i <= 12; i++) {
    await t.mutation(internal.mutations.upsertBill, {
      billId: `${i}hr119`,
      congress: 119,
      billType: "hr",
      billNumber: String(i),
      billTypeLabel: "H.R.",
      title: `Bill ${i}`,
      introducedDate: `2025-03-${String(i).padStart(2, "0")}`,
      sponsorFirstName: "Member",
      sponsorLastName: "Zero",
      sponsorParty: "D",
      sponsorState: "CA",
      sponsorBioguideId: "M000000",
    });
  }
}

describe("members.getPage", () => {
  test("no page for an id we hold nothing about, or not an id at all", async () => {
    const t = setup();
    await seed(t);
    expect(await t.query(api.members.getPage, { bioguideId: "Z999999" })).toBeNull();
    expect(await t.query(api.members.getPage, { bioguideId: "../etc" })).toBeNull();
  });

  test("the member, their confirmed accounts, and their newest ten bills, newest first", async () => {
    const t = setup();
    await seed(t);
    await t.mutation(internal.memberAccounts.recordSiteChecks, {
      results: [{ bioguideId: "M000000", status: "ok", links: ["x:m0"] }],
      now: "2026-11-01T08:10:00Z",
    });
    const page = await t.query(api.members.getPage, { bioguideId: "M000000" });
    expect(page!.member).toMatchObject({ name: "Member 0", chamber: "house", party: "D", district: 12, inOffice: true });
    expect(page!.accounts!.accounts.map((a) => a.url)).toEqual(["https://x.com/m0"]);
    expect(page!.congress).toBe(119);
    expect(page!.sponsored.map((b) => b.billId)).toEqual(
      ["12hr119", "11hr119", "10hr119", "9hr119", "8hr119", "7hr119", "6hr119", "5hr119", "4hr119", "3hr119"],
    );
    expect(page!.sponsorFilterName).toBe("Member Zero");
  });

  test("cosponsorships are newest first, and a withdrawn one is not listed", async () => {
    const t = setup();
    await seed(t);
    await t.mutation(internal.mutations.replaceBillCosponsors, {
      billId: "1hr119",
      cosponsors: [{ bioguideId: "M000005", firstName: "Member", lastName: "Five", sponsorshipDate: "2025-04-01", isOriginal: false }],
    });
    await t.mutation(internal.mutations.replaceBillCosponsors, {
      billId: "2hr119",
      cosponsors: [{ bioguideId: "M000005", firstName: "Member", lastName: "Five", sponsorshipDate: "2025-05-01", isOriginal: false }],
    });
    await t.mutation(internal.mutations.replaceBillCosponsors, {
      billId: "3hr119",
      cosponsors: [
        { bioguideId: "M000005", firstName: "Member", lastName: "Five", sponsorshipDate: "2025-06-01", isOriginal: false, withdrawnDate: "2025-06-02" },
      ],
    });
    const page = await t.query(api.members.getPage, { bioguideId: "M000005" });
    expect(page!.cosponsored.map((b) => [b.billId, b.joined])).toEqual([
      ["2hr119", "2025-05-01"],
      ["1hr119", "2025-04-01"],
    ]);
    expect(page!.sponsored).toEqual([]);
    expect(page!.sponsorFilterName).toBeNull();
  });

  test("a former member has a page but no accounts", async () => {
    const t = setup();
    await seed(t);
    await t.mutation(internal.memberAccounts.apply, {
      records: Array.from({ length: 539 }, (_, i) => member(i + 1)),
      force: false,
      now: "2026-11-02T07:40:00Z",
    });
    const page = await t.query(api.members.getPage, { bioguideId: "M000000" });
    expect(page!.member.inOffice).toBe(false);
    expect(page!.accounts).toBeNull();
  });
});
