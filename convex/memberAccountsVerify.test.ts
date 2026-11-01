/**
 * Run with: `pnpm test`.
 *
 * Reading a member's official home page for the social accounts it links.
 * The links are written as members' sites really write them (checked
 * 2026-11-01); each case is an account that would be wrongly confirmed or
 * wrongly hidden if the reading were off.
 */
import assert from "node:assert/strict";
import { isLinkedFrom, linkKey, linkedAccounts, looksBlocked } from "./memberAccountsVerify";

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

it("reads X and Twitter links the same way, ignoring case and @", () => {
  assert.equal(linkKey("https://x.com/RepAbeHamadeh"), "x:repabehamadeh");
  assert.equal(linkKey("https://twitter.com/RepDerekTranCA"), "x:repderektranca");
  assert.equal(linkKey("https://www.twitter.com/#!/SenSchumer"), "x:senschumer");
  assert.equal(linkKey("https://x.com/@RepFine?lang=en"), "x:repfine");
  assert.equal(linkKey("https://x.com/RepGallagherCA1/"), "x:repgallagherca1");
});

it("skips share and intent links, which are not accounts", () => {
  assert.equal(linkKey("https://twitter.com/intent/tweet?text=hi"), null);
  assert.equal(linkKey("https://twitter.com/share?url=x"), null);
  assert.equal(linkKey("https://www.facebook.com/sharer/sharer.php?u=x"), null);
  assert.equal(linkKey("https://www.youtube.com/watch?v=CcpM4amec8s"), null);
  assert.equal(linkKey("https://www.youtube.com/playlist?list=PL123"), null);
  assert.equal(linkKey("https://www.instagram.com/p/abc123/"), null);
  assert.equal(linkKey("not a url"), null);
});

it("reads every way a site links a Facebook page", () => {
  assert.equal(linkKey("https://www.facebook.com/RepAbeHamadeh/"), "facebook:repabehamadeh");
  assert.equal(linkKey("https://www.facebook.com/profile.php?id=61577293801543"), "facebook:61577293801543");
  assert.equal(linkKey("https://www.facebook.com/people/Rep-Clay-Fuller/61570681866170/"), "facebook:61570681866170");
  assert.equal(linkKey("https://m.facebook.com/pg/RepVanEpps/posts"), "facebook:repvanepps");
  assert.equal(linkKey("https://www.facebook.com/pages/Tom-McClintock/81125319109"), "facebook:81125319109");
  // Posts and photos on a page are not the page.
  assert.equal(linkKey("https://www.facebook.com/135031389892682_1629326505318517"), null);
  assert.equal(linkKey("https://www.facebook.com/photo.php?fbid=1"), null);
});

it("reads YouTube channel ids, @handles and old /user/ names", () => {
  assert.equal(linkKey("https://www.youtube.com/channel/UChI1UwZkFRh_Fctl9Ah5z8A"), "youtube:channel:uchi1uwzkfrh_fctl9ah5z8a");
  assert.equal(linkKey("https://www.youtube.com/@RepFine"), "youtube:name:repfine");
  assert.equal(linkKey("https://www.youtube.com/user/tomcoleok04"), "youtube:name:tomcoleok04");
  assert.equal(linkKey("https://www.youtube.com/housedems"), "youtube:name:housedems");
});

it("decodes &amp; in hrefs and reads single-quoted ones", () => {
  const html = `<a href='https://x.com/repmichaelrulli'>X</a>
    <a href="https://www.facebook.com/profile.php?id=61577293801543&amp;ref=x">FB</a>`;
  assert.deepEqual([...linkedAccounts(html)].sort(), ["facebook:61577293801543", "x:repmichaelrulli"]);
});

it("confirms only the exact account the page links", () => {
  // Rep. Clarke's site links repyvetteclarke; the volunteer file has a typo.
  const page = linkedAccounts(`<a href="https://www.instagram.com/repyvetteclarke">IG</a>`);
  assert.equal(isLinkedFrom(page, "instagram", "https://www.instagram.com/repyvettedclarke/", "@repyvettedclarke"), false);
  assert.equal(isLinkedFrom(page, "instagram", "https://www.instagram.com/repyvetteclarke/", "@repyvetteclarke"), true);
});

it("confirms a YouTube channel by its id or by its @name", () => {
  const byName = linkedAccounts(`<a href="https://www.youtube.com/@SenatorSchumer">YT</a>`);
  const byId = linkedAccounts(`<a href="https://www.youtube.com/channel/UC-ABttxh8uQv_10qmwGaidw">YT</a>`);
  const url = "https://www.youtube.com/channel/UC-ABttxh8uQv_10qmwGaidw";
  assert.equal(isLinkedFrom(byName, "youtube", url, "@SenatorSchumer"), true);
  assert.equal(isLinkedFrom(byId, "youtube", url, "@SenatorSchumer"), true);
  assert.equal(isLinkedFrom(byId, "youtube", "https://www.youtube.com/@other", "@other"), false);
});

it("does not confirm an account from a different platform with the same name", () => {
  const page = linkedAccounts(`<a href="https://www.instagram.com/repfine/">IG</a>`);
  assert.equal(isLinkedFrom(page, "x", "https://x.com/repfine", "@repfine"), false);
});

it("recognises a firewall's refusal page", () => {
  assert.equal(looksBlocked("<html><head><title>Senate.gov - Unauthorized</title>"), true);
  assert.equal(looksBlocked("<title>Access Denied</title>"), true);
  assert.equal(looksBlocked("<title>Representative Abe Hamadeh</title>"), false);
});

console.log(`\nmemberAccountsVerify: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
