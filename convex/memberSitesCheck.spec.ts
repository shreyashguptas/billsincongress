/// <reference types="vite/client" />
/**
 * The daily check of members' own sites, against how house.gov behaved on the
 * first live run (2 Nov 2026): eight fetches at a time, and after about 400
 * sites every House member from Takano to Zinke was turned away, though each
 * site answered normally when asked again one at a time. Those 39 members
 * showed only their website.
 */
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed(t: ReturnType<typeof convexTest>, members: Array<{ id: string; chamber: "house" | "senate" }>) {
  await t.run(async (ctx) => {
    for (const { id, chamber } of members) {
      const host = `${id.toLowerCase()}.${chamber}.gov`;
      await ctx.db.insert("memberAccounts", {
        bioguideId: id,
        name: id,
        chamber,
        state: "TX",
        inOffice: true,
        officialWebsiteUrl: `https://${host}`,
        accounts: [{ platform: "x", label: `@${id}`, url: `https://x.com/${id}`, source: "congress-legislators" }],
        fingerprint: id,
        changedAt: "2026-11-02T00:00:00Z",
      });
    }
  });
}

const page = (id: string) => `<html><title>Rep</title><a href="https://x.com/${id}">X</a></html>`;

afterEach(() => vi.unstubAllGlobals());

test("a site that turned the checker away for asking too fast is asked again later, and confirmed", async () => {
  const t = convexTest(schema, modules);
  await seed(t, [{ id: "T000472", chamber: "house" }, { id: "A000001", chamber: "house" }]);
  let refuse = true;
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.includes("t000472") && refuse) return new Response("slow down", { status: 429 });
    const id = url.includes("t000472") ? "T000472" : "A000001";
    return new Response(page(id), { status: 200 });
  });

  await t.action(internal.memberAccounts.checkSites, {});
  const before = await t.run((ctx) => ctx.db.query("memberAccounts").collect());
  expect(before.find((r) => r.bioguideId === "T000472")!.siteCheck?.status).toBe("blocked");
  expect(before.find((r) => r.bioguideId === "A000001")!.accounts[0].confirmedAt).toBeDefined();

  // The retry is scheduled for the refused site only.
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  const retry = scheduled.find((f) => f.name === "memberAccounts:checkSites");
  expect(retry?.args[0]).toEqual({ retry: 1, ids: ["T000472"] });
  expect(retry!.scheduledTime - Date.now()).toBeGreaterThan(10 * 60 * 1000);

  refuse = false;
  await t.action(internal.memberAccounts.checkSites, retry!.args[0]);
  const after = await t.run((ctx) => ctx.db.query("memberAccounts").collect());
  expect(after.find((r) => r.bioguideId === "T000472")!.accounts[0].confirmedAt).toBeDefined();
});

test("retries stop after the second, so a site that always refuses is not asked all day", async () => {
  const t = convexTest(schema, modules);
  await seed(t, [{ id: "S000148", chamber: "senate" }]);
  vi.stubGlobal("fetch", async () => new Response("no", { status: 403 }));
  await t.action(internal.memberAccounts.checkSites, { retry: 2, ids: ["S000148"] });
  const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  expect(scheduled.filter((f) => f.name === "memberAccounts:checkSites")).toHaveLength(0);
});

test("never more than two sites at once, and House sites before Senate ones", async () => {
  const t = convexTest(schema, modules);
  await seed(t, [
    { id: "S000001", chamber: "senate" },
    { id: "H000001", chamber: "house" },
    { id: "A000002", chamber: "senate" },
    { id: "H000002", chamber: "house" },
    { id: "H000003", chamber: "house" },
  ]);
  let inFlight = 0;
  let most = 0;
  const order: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const host = new URL(String(input)).hostname;
    order.push(host.endsWith("senate.gov") ? "senate" : "house");
    inFlight++;
    most = Math.max(most, inFlight);
    await new Promise((r) => setTimeout(r, 20));
    inFlight--;
    return new Response(page("x"), { status: 200 });
  });
  await t.action(internal.memberAccounts.checkSites, {});
  expect(most).toBeLessThanOrEqual(2);
  expect(order).toEqual(["house", "house", "house", "senate", "senate"]);
});
