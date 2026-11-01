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
  recordFingerprint,
  safetyProblem,
  MIN_MEMBERS,
  type AccountOverride,
} from "./memberAccountsParse";

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
    { type: "rep", state: "NY", url: "https://schumer.house.gov" },
    { type: "sen", state: "NY", url: "https://www.schumer.senate.gov" },
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
  terms: [{ type: "rep", state: "GA", url: "https://blair.house.gov/" }],
};

it("builds each platform's link from the source's handle", () => {
  const { records, rejected } = buildMemberRecords([schumerCurrent], [schumerSocial], []);
  assert.equal(rejected, 0);
  assert.deepEqual(records[0], {
    bioguideId: "S000148",
    name: "Charles E. Schumer",
    chamber: "senate",
    state: "NY",
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
    { bioguideId: "B001328", platform: "x", action: "set", value: "repevertonblair", proofUrl: "https://blair.house.gov", checked: "2026-11-01" },
    { bioguideId: "S000148", platform: "facebook", action: "hide", proofUrl: "https://www.schumer.senate.gov", checked: "2026-11-01", reason: "test" },
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
    { bioguideId: "B001328", platform: "facebook", action: "set", value: "share/1DrQURWm8o", proofUrl: "https://blair.house.gov", checked: "2026-11-01" },
  ];
  assert.throws(() => applyOverrides([{ bioguideId: "B001328", name: "x", chamber: "house", state: "GA", accounts: [] }], bad), /not a valid handle/);
});

it("ignores an override for someone not in office", () => {
  const overrides: AccountOverride[] = [
    { bioguideId: "Z999999", platform: "x", action: "set", value: "nobody", proofUrl: "https://z.house.gov", checked: "2026-11-01" },
  ];
  assert.equal(buildMemberRecords([newMember], [], overrides).records.length, 1);
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
  const reordered = { accounts: rest.accounts, state: rest.state, chamber: rest.chamber, name: rest.name, officialWebsiteUrl: rest.officialWebsiteUrl };
  assert.equal(recordFingerprint(rest), recordFingerprint(reordered));
  assert.notEqual(recordFingerprint(rest), recordFingerprint({ ...rest, accounts: rest.accounts.slice(1) }));
});

console.log(`\nmemberAccountsParse: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
