/// <reference types="vite/client" />
/**
 * The daily sync reads the congress-legislators project's main branch, as YAML.
 * Each case is a way the switch from its published JSON could go wrong
 * unnoticed: reading the old, stale copy; a parse that turns the files into
 * nothing; a broken download read as "nobody has accounts".
 */
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { stringify } from "yaml";
import { internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

/** 500 House members, shaped as legislators-current.yaml carries them. */
const current = Array.from({ length: 500 }, (_, i) => ({
  id: { bioguide: `M${String(i).padStart(6, "0")}`, govtrack: 400000 + i },
  name: { first: "Member", last: `Number${i}`, official_full: `Member Number${i}` },
  bio: { birthday: "1970-01-01", gender: "F" },
  terms: [{ type: "rep", start: "2025-01-03", end: "2027-01-03", state: "TX", district: (i % 30) + 1, party: "Democrat", url: `https://m${i}.house.gov` }],
}));
/** As legislators-social-media.yaml carries them, with a twitter_id too big for a JavaScript number. */
const social = [
  { id: { bioguide: "M000001", govtrack: 400001 }, social: { twitter: "Rep_Davidson", twitter_id: BigInt("1762595748238213120"), bluesky: "rep.bsky.social" } },
];

afterEach(() => vi.unstubAllGlobals());

test("reads the project's main branch as YAML, not its published copy", async () => {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    asked.push(url);
    const body = url.endsWith("/legislators-current.yaml") ? stringify(current) : stringify(social);
    return new Response(body, { status: 200 });
  });
  const t = convexTest(schema, modules);
  await t.action(internal.memberAccounts.sync, {});
  expect(asked.sort()).toEqual([
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml",
    "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-social-media.yaml",
  ]);
  const rows = await t.run((ctx) => ctx.db.query("memberAccounts").collect());
  expect(rows).toHaveLength(500);
  const one = rows.find((r) => r.bioguideId === "M000001")!;
  expect(one.accounts.map((a) => a.url)).toEqual(["https://x.com/Rep_Davidson"]);
  expect(one.officialWebsiteUrl).toBe("https://m1.house.gov");
});

/** Sync once with good files, so a later bad download has rows it could wipe. */
async function seeded() {
  vi.stubGlobal("fetch", async (input: string | URL) =>
    new Response(String(input).endsWith("/legislators-current.yaml") ? stringify(current) : stringify(social), { status: 200 }),
  );
  const t = convexTest(schema, modules);
  await t.action(internal.memberAccounts.sync, {});
  expect(await t.run((ctx) => ctx.db.query("memberAccounts").collect())).toHaveLength(500);
  return t;
}

/** The error_kind of the "member accounts sync failed" log line this test caused. */
async function failureKind(t: ReturnType<typeof convexTest>) {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  const line = jobs.map((j) => j.args[0]).find((a) => a?.message === "member accounts sync failed");
  return line?.attributes?.error_kind;
}

test("a download that is not YAML keeps what we had, and says bad_yaml", async () => {
  process.env.POSTHOG_KEY = "phc_test_not_a_real_key";
  try {
    const t = await seeded();
    vi.stubGlobal("fetch", async () => new Response("key: [unclosed\n  - : :", { status: 200 }));
    await t.action(internal.memberAccounts.sync, {});
    expect(await t.run((ctx) => ctx.db.query("memberAccounts").collect())).toHaveLength(500);
    expect(await failureKind(t)).toBe("bad_yaml");
  } finally {
    delete process.env.POSTHOG_KEY;
  }
});

test("a failed download keeps what we had, and names the file and status", async () => {
  process.env.POSTHOG_KEY = "phc_test_not_a_real_key";
  try {
    const t = await seeded();
    vi.stubGlobal("fetch", async (input: string | URL) =>
      String(input).endsWith("/legislators-current.yaml")
        ? new Response("Not Found", { status: 404 })
        : new Response(stringify(social), { status: 200 }),
    );
    await t.action(internal.memberAccounts.sync, {});
    expect(await t.run((ctx) => ctx.db.query("memberAccounts").collect())).toHaveLength(500);
    expect(await failureKind(t)).toBe("legislators-current.yaml: HTTP 404");
  } finally {
    delete process.env.POSTHOG_KEY;
  }
});
