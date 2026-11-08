/**
 * Run with: `pnpm test`.
 *
 * Every case is a way a wrong or guessed account could reach a reader: a value
 * that is not a handle, a non-official website, a broken download read as
 * "nobody has accounts", an override that is not a real handle.
 */
import assert from "node:assert/strict";
import {
  accountFrom,
  applyOverrides,
  buildMemberRecords,
  officialWebsite,
  overrideReport,
  recordFingerprint,
  safetyProblem,
  MIN_MEMBERS,
  type AccountOverride,
} from "./memberAccountsParse";
import { ACCOUNT_OVERRIDES } from "./memberAccountOverrides";
import { confirmOnPage, linkKey } from "./memberAccountsVerify";

let passed = 0;
const failures: string[] = [];

function it(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (err) {
    failures.push(`  ✗ ${name}\n    ${err instanceof Error ? err.message.split("\n").join("\n    ") : String(err)}`);
  }
}

const schumerCurrent = {
  id: { bioguide: "S000148" },
  name: { official_full: "Charles E. Schumer", first: "Charles", last: "Schumer" },
  terms: [
    { type: "rep", state: "NY", district: 9, party: "Democrat", url: "https://schumer.house.gov" },
    { type: "sen", state: "NY", party: "Democrat", url: "https://www.schumer.senate.gov" },
  ],
};
// Values as the source carries them on 2026-11-01.
const schumerSocial = {
  id: { bioguide: "S000148" },
  social: {
    twitter: "SenSchumer",
    facebook: "senschumer",
    youtube: "SenatorSchumer",
    youtube_id: "UC-ABttxh8uQv_10qmwGaidw",
    twitter_id: 17494010,
    instagram: "senschumer",
  },
};
const newMember = {
  id: { bioguide: "B001328" },
  name: { first: "Everton", last: "Blair" },
  terms: [{ type: "rep", state: "GA", district: 13, party: "Democrat", url: "https://blair.house.gov/" }],
};

it("builds each platform's link from the source's handle", () => {
  const { records, rejected } = buildMemberRecords([schumerCurrent], [schumerSocial], []);
  assert.equal(rejected, 0);
  assert.deepEqual(records[0], {
    bioguideId: "S000148",
    name: "Charles E. Schumer",
    chamber: "senate",
    state: "NY",
    party: "D",
    officialWebsiteUrl: "https://www.schumer.senate.gov",
    accounts: [
      { platform: "x", label: "@SenSchumer", url: "https://x.com/SenSchumer", source: "congress-legislators" },
      { platform: "facebook", label: "senschumer", url: "https://www.facebook.com/senschumer", source: "congress-legislators" },
      { platform: "instagram", label: "@senschumer", url: "https://www.instagram.com/senschumer/", source: "congress-legislators" },
      // The channel id links (it survives a rename); the name labels it.
      {
        platform: "youtube",
        label: "@SenatorSchumer",
        url: "https://www.youtube.com/channel/UC-ABttxh8uQv_10qmwGaidw",
        source: "congress-legislators",
      },
    ],
  });
});

it("uses the latest term for chamber and website", () => {
  const { records } = buildMemberRecords([schumerCurrent], [], []);
  assert.equal(records[0].chamber, "senate");
  assert.equal(records[0].officialWebsiteUrl, "https://www.schumer.senate.gov");
});

it("keeps a member with no social entry, with no accounts, never guessed ones", () => {
  const { records } = buildMemberRecords([newMember], [schumerSocial], []);
  assert.equal(records.length, 1);
  assert.deepEqual(records[0].accounts, []);
  assert.equal(records[0].name, "Everton Blair");
  assert.equal(records[0].officialWebsiteUrl, "https://blair.house.gov");
  assert.equal(records[0].district, 13);
});

it("reads the party as the one-letter code the site uses, from the latest term", () => {
  const { records } = buildMemberRecords(
    [{ ...newMember, terms: [{ type: "rep", state: "GA", district: 0, party: "Independent", url: "https://x.house.gov" }] }],
    [],
    [],
  );
  assert.equal(records[0].party, "I");
  assert.equal(records[0].district, 0);
});

it("links a YouTube name without a channel id as an @handle, not /user/", () => {
  // youtube.com/user/repemiliasykes is a 404; /@repemiliasykes is her channel.
  const a = accountFrom("youtube", "repemiliasykes", "congress-legislators");
  assert.equal(a?.url, "https://www.youtube.com/@repemiliasykes");
  assert.equal(accountFrom("youtube", "@sentedbudd", "congress-legislators")?.url, "https://www.youtube.com/@sentedbudd");
});

it("labels a numeric Facebook page id as a page, not as a number", () => {
  const a = accountFrom("facebook", "61577293801543", "override");
  assert.equal(a?.label, "Page");
  assert.equal(a?.url, "https://www.facebook.com/61577293801543");
});

it("drops values that are not that platform's handle and counts them", () => {
  for (const [platform, value] of [
    ["x", "has space"],
    ["x", "waytoolonghandle_x"],
    ["x", "https://x.com/evil"],
    ["facebook", "share/1DrQURWm8o"],
    ["facebook", "profile.php?id=1"],
    ["instagram", "a/b"],
    ["youtube", "../watch"],
  ] as const) {
    assert.equal(accountFrom(platform, value, "congress-legislators"), null, `${platform} ${value}`);
  }
  const { records, rejected } = buildMemberRecords(
    [schumerCurrent],
    [{ id: { bioguide: "S000148" }, social: { twitter: "not a handle", facebook: "senschumer" } }],
    [],
  );
  assert.equal(rejected, 1);
  assert.deepEqual(records[0].accounts.map((a) => a.platform), ["facebook"]);
});

it("accepts only https house.gov and senate.gov websites", () => {
  assert.equal(officialWebsite("https://rulli.house.gov/"), "https://rulli.house.gov");
  assert.equal(officialWebsite("http://rulli.house.gov"), undefined);
  assert.equal(officialWebsite("https://rulli-for-congress.com"), undefined);
  assert.equal(officialWebsite("https://house.gov.evil.com"), undefined);
  assert.equal(officialWebsite(undefined), undefined);
});

it("throws on a download that is not a list, rather than reading it as nobody", () => {
  assert.throws(() => buildMemberRecords({ error: "rate limited" }, [], []), /not a list/);
  assert.throws(() => buildMemberRecords([], "<html>", []), /not a list/);
});

it("applies a set override with its proof, and a hide override", () => {
  const overrides: AccountOverride[] = [
    { bioguideId: "B001328", platform: "x", action: "set", value: "repevertonblair", proofUrl: "https://blair.house.gov", checked: "2026-11-01", replaces: null },
    { bioguideId: "S000148", platform: "facebook", action: "hide", proofUrl: "https://www.schumer.senate.gov", checked: "2026-11-01", replaces: "senschumer", reason: "test" },
  ];
  const { records } = buildMemberRecords([schumerCurrent, newMember], [schumerSocial], overrides);
  const blair = records.find((r) => r.bioguideId === "B001328");
  assert.deepEqual(blair?.accounts, [
    { platform: "x", label: "@repevertonblair", url: "https://x.com/repevertonblair", source: "override", proofUrl: "https://blair.house.gov" },
  ]);
  const schumer = records.find((r) => r.bioguideId === "S000148");
  assert.deepEqual(schumer?.accounts.map((a) => a.platform), ["x", "instagram", "youtube"]);
});

it("refuses an override whose value is not a handle", () => {
  const bad: AccountOverride[] = [
    { bioguideId: "B001328", platform: "facebook", action: "set", value: "share/1DrQURWm8o", proofUrl: "https://blair.house.gov", checked: "2026-11-01", replaces: null },
  ];
  assert.throws(() => applyOverrides([{ bioguideId: "B001328", name: "x", chamber: "house", state: "GA", accounts: [] }], bad), /not a valid handle/);
});

it("ignores an override for someone not in office", () => {
  const overrides: AccountOverride[] = [
    { bioguideId: "Z999999", platform: "x", action: "set", value: "nobody", proofUrl: "https://z.house.gov", checked: "2026-11-01", replaces: null },
  ];
  assert.equal(buildMemberRecords([newMember], [], overrides).records.length, 1);
});

// Rep. Cloud, as on 2026-11-01: the source listed @RepCloudTX, his site linked
// @RepMichaelCloud, so our override says RepMichaelCloud and replaces RepCloudTX.
const cloudCurrent = {
  id: { bioguide: "C001115" },
  name: { official_full: "Michael Cloud" },
  terms: [{ type: "rep", state: "TX", district: 27, party: "Republican", url: "https://cloud.house.gov" }],
};
const cloudSocial = (twitter: string | undefined) => ({ id: { bioguide: "C001115" }, social: twitter ? { twitter } : {} });
const cloudOverride: AccountOverride = {
  bioguideId: "C001115",
  platform: "x",
  action: "set",
  value: "RepMichaelCloud",
  proofUrl: "https://cloud.house.gov",
  checked: "2026-11-01",
  replaces: "RepCloudTX",
};
const cloudWith = (twitter: string | undefined, overrides: AccountOverride[] = [cloudOverride]) =>
  buildMemberRecords([cloudCurrent], [cloudSocial(twitter)], overrides).records[0];

it("reports an override as stale when the member is renamed again upstream, and still applies it", () => {
  // Was: the project renamed him to @RepCloud and the sync said nothing; our
  // old override kept replacing the project's value for good.
  const cloud = cloudWith("RepCloud");
  assert.deepEqual(cloud.overrideFindings, [{ platform: "x", status: "stale", sourceUrl: "https://x.com/RepCloud" }]);
  // What is shown does not change: the override still applies.
  assert.deepEqual(cloud.accounts.map((a) => [a.url, a.source]), [["https://x.com/RepMichaelCloud", "override"]]);
  assert.deepEqual(overrideReport([cloud]), { redundant: 0, stale: 1, redundantIds: [], staleIds: ["C001115"] });
});

it("reports an override as redundant once the source carries the same account, in any case", () => {
  const cloud = cloudWith("repmichaelcloud");
  assert.deepEqual(cloud.overrideFindings, [{ platform: "x", status: "redundant", sourceUrl: "https://x.com/repmichaelcloud" }]);
  assert.equal(cloud.accounts[0].source, "override");
  assert.deepEqual(overrideReport([cloud]), { redundant: 1, stale: 0, redundantIds: ["C001115"], staleIds: [] });
});

it("reports nothing while the source still carries the value the override replaced", () => {
  const cloud = cloudWith("RepCloudTX");
  assert.equal(cloud.overrideFindings, undefined);
  // So a member with nothing to report keeps the fingerprint it had before this report existed.
  const { bioguideId: _id, overrideFindings: _f, ...rest } = cloud;
  assert.equal(recordFingerprint(cloud), recordFingerprint(rest));
});

it("reports a member the source had nothing for once the source lists an account", () => {
  const blair: AccountOverride = { ...cloudOverride, bioguideId: "B001328", value: "repevertonblair", proofUrl: "https://blair.house.gov", replaces: null };
  const social = (twitter: string) => [{ id: { bioguide: "B001328" }, social: { twitter } }];
  assert.equal(buildMemberRecords([newMember], [], [blair]).records[0].overrideFindings, undefined);
  assert.equal(buildMemberRecords([newMember], social("RepEvertonBlair"), [blair]).records[0].overrideFindings?.[0].status, "redundant");
  assert.equal(buildMemberRecords([newMember], social("BlairForGeorgia"), [blair]).records[0].overrideFindings?.[0].status, "stale");
});

it("reports a hide override as redundant once the source drops the account, and stale when it changes", () => {
  const hide: AccountOverride = { bioguideId: "C001115", platform: "x", action: "hide", proofUrl: "https://cloud.house.gov", checked: "2026-11-01", replaces: "RepCloudTX", reason: "test" };
  assert.equal(cloudWith("RepCloudTX", [hide]).overrideFindings, undefined);
  assert.equal(cloudWith(undefined, [hide]).overrideFindings?.[0].status, "redundant");
  const changed = cloudWith("RepCloud", [hide]);
  assert.equal(changed.overrideFindings?.[0].status, "stale");
  assert.deepEqual(changed.accounts, []);
});

it("matches a YouTube override to the source by channel id or by name, in any address form", () => {
  // Rep. Clarke, 2026-11-01: the source's channel id was another channel; her
  // site links @RepYvetteDClarke. Our upstream fix sets her real channel id
  // and that name. Was: read as "stale", since a handle is not a channel id.
  const clarkeCurrent = { ...cloudCurrent, id: { bioguide: "C001067" } };
  const clarke: AccountOverride = { ...cloudOverride, bioguideId: "C001067", platform: "youtube", value: "RepYvetteDClarke", replaces: "UC8SuQiuL2P9fUHAxuRoTdUQ" };
  const withYoutube = (social: Record<string, string>, o = clarke) =>
    buildMemberRecords([clarkeCurrent], [{ id: { bioguide: "C001067" }, social }], [o]).records[0].overrideFindings;
  assert.equal(withYoutube({ youtube: "RepYvetteDClarke", youtube_id: "UCuz1ofl3ZqdkjRahPzTKGDQ" })?.[0].status, "redundant");
  // Not fixed yet: the old channel id, alone or beside a name that is not ours.
  assert.equal(withYoutube({ youtube_id: "UC8SuQiuL2P9fUHAxuRoTdUQ" }), undefined);
  assert.equal(withYoutube({ youtube: "repyvetteclarke", youtube_id: "UC8SuQiuL2P9fUHAxuRoTdUQ" }), undefined);
  // A different channel and a different name: the account moved on.
  assert.equal(withYoutube({ youtube: "ClarkeForCongress", youtube_id: "UCaaaaaaaaaaaaaaaaaaaaaa" })?.[0].status, "stale");
  // Our name beside the OTHER channel id it replaced still reads redundant:
  // deleting the override changes nothing a reader sees, because the site
  // check confirms by whichever the member's site links and sends the reader
  // there, so the wrong channel id never reaches a page.
  const half = { youtube: "RepYvetteDClarke", youtube_id: "UC8SuQiuL2P9fUHAxuRoTdUQ" };
  assert.equal(withYoutube(half)?.[0].status, "redundant");
  const withoutOverride = buildMemberRecords([clarkeCurrent], [{ id: { bioguide: "C001067" }, social: half }], []).records[0];
  const page = new Set([linkKey("https://www.youtube.com/@RepYvetteDClarke")!]);
  assert.deepEqual(confirmOnPage(page, withoutOverride.accounts[0]), { url: "https://www.youtube.com/@RepYvetteDClarke", label: "@RepYvetteDClarke" });
  // An old /c/ address is the same name.
  const cForm = { ...clarke, value: "c/RepYvetteDClarke" };
  assert.equal(withYoutube({ youtube: "RepYvetteDClarke", youtube_id: "UCuz1ofl3ZqdkjRahPzTKGDQ" }, cForm)?.[0].status, "redundant");
  // A channel-id override is the same as that channel id.
  const byId = { ...clarke, value: "UCuz1ofl3ZqdkjRahPzTKGDQ" };
  assert.equal(withYoutube({ youtube_id: "UCuz1ofl3ZqdkjRahPzTKGDQ" }, byId)?.[0].status, "redundant");
});

it("counts every override entry but lists each member once", () => {
  const ig: AccountOverride = { ...cloudOverride, platform: "instagram", value: "repmichaelcloud", replaces: "repcloudtx" };
  const social = { id: { bioguide: "C001115" }, social: { twitter: "RepCloud", instagram: "cloud_official" } };
  const { records } = buildMemberRecords([cloudCurrent], [social], [ig, cloudOverride]);
  // In platform order, whatever order the overrides came in.
  assert.deepEqual(records[0].overrideFindings?.map((f) => f.platform), ["x", "instagram"]);
  assert.deepEqual(overrideReport(records), { redundant: 0, stale: 2, redundantIds: [], staleIds: ["C001115"] });
});

it("finds nothing to report in our own overrides against the source they were checked against", () => {
  // Every `replaces` in memberAccountOverrides.ts, laid out as a source file:
  // on the day they were checked, every override was still needed.
  const social = new Map<string, Record<string, string>>();
  for (const o of ACCOUNT_OVERRIDES) {
    const entry = social.get(o.bioguideId) ?? {};
    if (o.replaces !== null) {
      const field = o.platform === "x" ? "twitter" : o.platform === "youtube" && /^UC[A-Za-z0-9_-]{22}$/.test(o.replaces) ? "youtube_id" : o.platform;
      entry[field] = o.replaces;
    }
    social.set(o.bioguideId, entry);
  }
  const current = [...social.keys()].map((bioguide) => ({
    id: { bioguide },
    name: { official_full: bioguide },
    terms: [{ type: "rep", state: "XX", district: 1, party: "Democrat", url: "https://example.house.gov" }],
  }));
  const files = [...social].map(([bioguide, s]) => ({ id: { bioguide }, social: s }));
  const { records } = buildMemberRecords(current, files, ACCOUNT_OVERRIDES);
  assert.deepEqual(overrideReport(records), { redundant: 0, stale: 0, redundantIds: [], staleIds: [] });
});

it("refuses a download that would quietly empty the site", () => {
  assert.match(safetyProblem({ members: 12, accountsDroppedFromStayingMembers: 0 }) ?? "", /only 12 members/);
  assert.match(safetyProblem({ members: 539, accountsDroppedFromStayingMembers: 300 }) ?? "", /300 accounts/);
  assert.equal(safetyProblem({ members: 539, accountsDroppedFromStayingMembers: 3 }), null);
  assert.equal(safetyProblem({ members: MIN_MEMBERS, accountsDroppedFromStayingMembers: 0 }), null);
});

it("fingerprints a row by its content, not by key order", () => {
  const { records } = buildMemberRecords([schumerCurrent], [schumerSocial], []);
  const { bioguideId: _id, ...rest } = records[0];
  const reordered = { accounts: rest.accounts, party: rest.party, state: rest.state, chamber: rest.chamber, name: rest.name, officialWebsiteUrl: rest.officialWebsiteUrl };
  assert.equal(recordFingerprint(rest), recordFingerprint(reordered));
  assert.notEqual(recordFingerprint(rest), recordFingerprint({ ...rest, accounts: rest.accounts.slice(1) }));
});

console.log(`\nmemberAccountsParse: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
